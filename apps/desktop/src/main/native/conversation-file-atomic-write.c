#define _DARWIN_C_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#ifndef O_CLOEXEC
#define O_CLOEXEC 0
#endif

#ifndef RENAME_EXCL
#define RENAME_EXCL 0x00000004
#endif

#ifndef RENAME_SWAP
#define RENAME_SWAP 0x00000002
#endif

static const char *errno_name(int value) {
  switch (value) {
    case 0:
      return "NONE";
    case EACCES:
      return "EACCES";
    case EEXIST:
      return "EEXIST";
    case EIO:
      return "EIO";
    case EISDIR:
      return "EISDIR";
    case ELOOP:
      return "ELOOP";
    case ENAMETOOLONG:
      return "ENAMETOOLONG";
    case ENOENT:
      return "ENOENT";
    case ENOMEM:
      return "ENOMEM";
    case ENOTDIR:
      return "ENOTDIR";
    case EPERM:
      return "EPERM";
    case EINVAL:
      return "EINVAL";
    default:
      return "UNKNOWN";
  }
}

static void print_json_string(const char *value) {
  putchar('"');
  for (const unsigned char *cursor = (const unsigned char *)value; *cursor != '\0'; cursor += 1) {
    switch (*cursor) {
      case '\\':
        fputs("\\\\", stdout);
        break;
      case '"':
        fputs("\\\"", stdout);
        break;
      case '\b':
        fputs("\\b", stdout);
        break;
      case '\f':
        fputs("\\f", stdout);
        break;
      case '\n':
        fputs("\\n", stdout);
        break;
      case '\r':
        fputs("\\r", stdout);
        break;
      case '\t':
        fputs("\\t", stdout);
        break;
      default:
        if (*cursor < 0x20) {
          printf("\\u%04x", *cursor);
        } else {
          putchar(*cursor);
        }
    }
  }
  putchar('"');
}

static int emit_result_with_mutation(const char *status, int errnum, const char *detail, int did_mutate) {
  fputs("{\"status\":", stdout);
  print_json_string(status);
  fputs(",\"errno\":", stdout);
  printf("%d", errnum);
  fputs(",\"errnoName\":", stdout);
  print_json_string(errno_name(errnum));
  fputs(",\"message\":", stdout);
  print_json_string(errnum == 0 ? detail : strerror(errnum));
  fputs(",\"didMutate\":", stdout);
  fputs(did_mutate ? "true" : "false", stdout);
  fputs("}\n", stdout);
  fflush(stdout);
  return strcmp(status, "ok") == 0 ? 0 : 1;
}

static int emit_result(const char *status, int errnum, const char *detail) {
  return emit_result_with_mutation(status, errnum, detail, 0);
}

static int is_safe_basename(const char *value) {
  return value[0] != '\0' && strchr(value, '/') == NULL;
}

static int is_safe_path_component(const char *value) {
  return value[0] != '\0' && strcmp(value, ".") != 0 && strcmp(value, "..") != 0 && strchr(value, '/') == NULL;
}

static int parse_ull(const char *value, unsigned long long *parsed) {
  char *end = NULL;
  errno = 0;
  unsigned long long result = strtoull(value, &end, 10);
  if (errno != 0 || end == value || *end != '\0') {
    return -1;
  }
  *parsed = result;
  return 0;
}

static int parse_mode(const char *value, mode_t *parsed) {
  char *end = NULL;
  errno = 0;
  long result = strtol(value, &end, 10);
  if (errno != 0 || end == value || *end != '\0' || result < 0 || result > 07777) {
    return -1;
  }
  *parsed = (mode_t)result;
  return 0;
}

static int write_all(int fd, const char *buffer, ssize_t length) {
  ssize_t offset = 0;
  while (offset < length) {
    ssize_t written = write(fd, buffer + offset, (size_t)(length - offset));
    if (written < 0) {
      if (errno == EINTR) {
        continue;
      }
      return -1;
    }
    if (written == 0) {
      errno = EIO;
      return -1;
    }
    offset += written;
  }
  return 0;
}

static void cleanup_temp(int parent_fd, const char *temp_name, int temp_created) {
  if (temp_created && parent_fd >= 0) {
    unlinkat(parent_fd, temp_name, 0);
  }
}

static int open_parent_dir_from_root(
  const char *root_path,
  const char *relative_parent_path,
  unsigned long long expected_root_dev,
  unsigned long long expected_root_ino,
  int create_parent_directories,
  int *did_mutate,
  int *out_fd
) {
  int current_fd = open(root_path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (current_fd < 0) {
    return emit_result("root_open_failed", errno, "root directory could not be opened");
  }

  struct stat root_stat;
  if (fstat(current_fd, &root_stat) != 0) {
    int saved_errno = errno;
    close(current_fd);
    return emit_result("root_open_failed", saved_errno, "root directory could not be inspected");
  }

  if ((unsigned long long)root_stat.st_dev != expected_root_dev || (unsigned long long)root_stat.st_ino != expected_root_ino) {
    close(current_fd);
    return emit_result("root_changed", 0, "root directory changed before parent open");
  }

  if (relative_parent_path[0] == '\0' || strcmp(relative_parent_path, ".") == 0) {
    *out_fd = current_fd;
    return 0;
  }

  char *path_copy = strdup(relative_parent_path);
  if (path_copy == NULL) {
    int saved_errno = errno;
    close(current_fd);
    return emit_result("parent_open_failed", saved_errno, "parent path could not be copied");
  }

  char *saveptr = NULL;
  char *component = strtok_r(path_copy, "/", &saveptr);
  while (component != NULL) {
    if (!is_safe_path_component(component)) {
      free(path_copy);
      close(current_fd);
      errno = EINVAL;
      return emit_result_with_mutation("parent_open_failed", EINVAL, "parent path contains an unsafe component", *did_mutate);
    }

    int next_fd = openat(current_fd, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (next_fd < 0 && errno == ENOENT && create_parent_directories) {
      if (mkdirat(current_fd, component, 0755) == 0) {
        *did_mutate = 1;
      } else if (errno != EEXIST) {
        int saved_errno = errno;
        free(path_copy);
        close(current_fd);
        return emit_result_with_mutation("parent_create_failed", saved_errno, "parent directory component could not be created", *did_mutate);
      }
      next_fd = openat(current_fd, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    }
    if (next_fd < 0) {
      int saved_errno = errno;
      free(path_copy);
      close(current_fd);
      return emit_result_with_mutation("parent_open_failed", saved_errno, "parent directory component could not be opened", *did_mutate);
    }

    close(current_fd);
    current_fd = next_fd;
    component = strtok_r(NULL, "/", &saveptr);
  }

  free(path_copy);
  *out_fd = current_fd;
  return 0;
}

int main(int argc, char **argv) {
  if (argc != 17) {
    return emit_result("usage_error", 0, "expected rootPath relativeParentPath targetBaseName tempName targetKind mode expectedRootDev expectedRootIno expectedKind expectedDev expectedIno expectedMode expectedSize expectedMtimeNs expectedCtimeNs parentMode");
  }

  const char *root_path = argv[1];
  const char *relative_parent_path = argv[2];
  const char *target_name = argv[3];
  const char *temp_name = argv[4];
  const char *target_kind = argv[5];
  mode_t target_mode = 0;
  unsigned long long expected_root_dev = 0;
  unsigned long long expected_root_ino = 0;
  int expected_missing = 0;
  unsigned long long expected_dev = 0;
  unsigned long long expected_ino = 0;
  unsigned long long expected_mode = 0;
  unsigned long long expected_size = 0;
  unsigned long long expected_mtime_ns = 0;
  unsigned long long expected_ctime_ns = 0;
  int create_parent_directories = 0;

  if (!is_safe_basename(target_name) || !is_safe_basename(temp_name)) {
    return emit_result("usage_error", 0, "target and temp names must be basenames");
  }
  if (
    (strcmp(target_kind, "file") != 0 && strcmp(target_kind, "symlink") != 0) ||
    parse_mode(argv[6], &target_mode) != 0 ||
    parse_ull(argv[7], &expected_root_dev) != 0 ||
    parse_ull(argv[8], &expected_root_ino) != 0 ||
    (strcmp(argv[9], "present") != 0 && strcmp(argv[9], "missing") != 0) ||
    parse_ull(argv[10], &expected_dev) != 0 ||
    parse_ull(argv[11], &expected_ino) != 0 ||
    parse_ull(argv[12], &expected_mode) != 0 ||
    parse_ull(argv[13], &expected_size) != 0 ||
    parse_ull(argv[14], &expected_mtime_ns) != 0 ||
    parse_ull(argv[15], &expected_ctime_ns) != 0 ||
    (strcmp(argv[16], "create") != 0 && strcmp(argv[16], "existing") != 0)
  ) {
    return emit_result("usage_error", 0, "kind, mode, revision, or identity could not be parsed");
  }
  expected_missing = strcmp(argv[9], "missing") == 0;
  create_parent_directories = strcmp(argv[16], "create") == 0;

  int parent_fd = -1;
  int parent_did_mutate = 0;
  int parent_open_result = open_parent_dir_from_root(root_path, relative_parent_path, expected_root_dev, expected_root_ino, create_parent_directories, &parent_did_mutate, &parent_fd);
  if (parent_open_result != 0) {
    return parent_open_result;
  }
#define EMIT_AFTER_PARENT(status, errnum, detail) emit_result_with_mutation(status, errnum, detail, parent_did_mutate)

  int temp_created = 0;
  if (strcmp(target_kind, "file") == 0) {
    int temp_fd = openat(parent_fd, temp_name, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (temp_fd < 0) {
      int saved_errno = errno;
      close(parent_fd);
      return EMIT_AFTER_PARENT("temp_create_failed", saved_errno, "temporary file could not be created");
    }
    temp_created = 1;

    char buffer[16384];
    for (;;) {
      ssize_t bytes_read = read(STDIN_FILENO, buffer, sizeof(buffer));
      if (bytes_read < 0) {
        if (errno == EINTR) continue;
        int saved_errno = errno;
        close(temp_fd);
        cleanup_temp(parent_fd, temp_name, temp_created);
        close(parent_fd);
        return EMIT_AFTER_PARENT("write_failed", saved_errno, "stdin could not be read");
      }
      if (bytes_read == 0) break;
      if (write_all(temp_fd, buffer, bytes_read) != 0) {
        int saved_errno = errno;
        close(temp_fd);
        cleanup_temp(parent_fd, temp_name, temp_created);
        close(parent_fd);
        return EMIT_AFTER_PARENT("write_failed", saved_errno, "temporary file could not be written");
      }
    }

    if (fsync(temp_fd) != 0 || fchmod(temp_fd, target_mode) != 0 || fsync(temp_fd) != 0) {
      int saved_errno = errno;
      close(temp_fd);
      cleanup_temp(parent_fd, temp_name, temp_created);
      close(parent_fd);
      return EMIT_AFTER_PARENT("write_failed", saved_errno, "temporary file content or metadata could not be synced");
    }
    if (close(temp_fd) != 0) {
      int saved_errno = errno;
      cleanup_temp(parent_fd, temp_name, temp_created);
      close(parent_fd);
      return EMIT_AFTER_PARENT("write_failed", saved_errno, "temporary file could not be closed");
    }
  } else {
    size_t capacity = 1024;
    size_t length = 0;
    char *link_target = malloc(capacity + 1);
    if (link_target == NULL) {
      close(parent_fd);
      return EMIT_AFTER_PARENT("temp_create_failed", ENOMEM, "symlink target buffer could not be allocated");
    }
    for (;;) {
      if (length == capacity) {
        if (capacity >= 1024 * 1024) {
          free(link_target);
          close(parent_fd);
          return EMIT_AFTER_PARENT("write_failed", ENAMETOOLONG, "symlink target exceeds the safety limit");
        }
        capacity *= 2;
        char *expanded = realloc(link_target, capacity + 1);
        if (expanded == NULL) {
          free(link_target);
          close(parent_fd);
          return EMIT_AFTER_PARENT("write_failed", ENOMEM, "symlink target buffer could not be expanded");
        }
        link_target = expanded;
      }
      ssize_t bytes_read = read(STDIN_FILENO, link_target + length, capacity - length);
      if (bytes_read < 0) {
        if (errno == EINTR) continue;
        int saved_errno = errno;
        free(link_target);
        close(parent_fd);
        return EMIT_AFTER_PARENT("write_failed", saved_errno, "symlink target could not be read");
      }
      if (bytes_read == 0) break;
      if (memchr(link_target + length, '\0', (size_t)bytes_read) != NULL) {
        free(link_target);
        close(parent_fd);
        return EMIT_AFTER_PARENT("write_failed", EINVAL, "symlink target contains a NUL byte");
      }
      length += (size_t)bytes_read;
    }
    link_target[length] = '\0';
    if (symlinkat(link_target, parent_fd, temp_name) != 0) {
      int saved_errno = errno;
      free(link_target);
      close(parent_fd);
      return EMIT_AFTER_PARENT("temp_create_failed", saved_errno, "temporary symlink could not be created");
    }
    free(link_target);
    temp_created = 1;
  }

  if (expected_missing) {
    if (renameatx_np(parent_fd, temp_name, parent_fd, target_name, RENAME_EXCL) != 0) {
      int saved_errno = errno;
      cleanup_temp(parent_fd, temp_name, temp_created);
      close(parent_fd);
      return EMIT_AFTER_PARENT("target_changed", saved_errno, "target was expected to remain missing until install");
    }
    temp_created = 0;
  } else {
    struct stat preflight_stat = {0};
    if (fstatat(parent_fd, target_name, &preflight_stat, AT_SYMLINK_NOFOLLOW) != 0) {
      int saved_errno = errno;
      cleanup_temp(parent_fd, temp_name, temp_created);
      close(parent_fd);
      return EMIT_AFTER_PARENT("target_changed", saved_errno, "target could not be inspected before atomic swap");
    }
    unsigned long long preflight_mtime_ns = (unsigned long long)preflight_stat.st_mtimespec.tv_sec * 1000000000ULL + (unsigned long long)preflight_stat.st_mtimespec.tv_nsec;
    unsigned long long preflight_ctime_ns = (unsigned long long)preflight_stat.st_ctimespec.tv_sec * 1000000000ULL + (unsigned long long)preflight_stat.st_ctimespec.tv_nsec;
    if (
      (unsigned long long)preflight_stat.st_dev != expected_dev ||
      (unsigned long long)preflight_stat.st_ino != expected_ino ||
      (unsigned long long)preflight_stat.st_mode != expected_mode ||
      (unsigned long long)preflight_stat.st_size != expected_size ||
      preflight_mtime_ns != expected_mtime_ns ||
      preflight_ctime_ns != expected_ctime_ns
    ) {
      cleanup_temp(parent_fd, temp_name, temp_created);
      close(parent_fd);
      return EMIT_AFTER_PARENT("target_changed", 0, "target revision changed before atomic swap");
    }

    /*
     * Swap keeps target_name continuously present. The previous target moves
     * to temp_name atomically, where its expected revision can be verified
     * before it is removed. A mismatch is rolled back with the same atomic
     * swap, preserving both path visibility and concurrent data.
     */
    if (renameatx_np(parent_fd, temp_name, parent_fd, target_name, RENAME_SWAP) != 0) {
      int saved_errno = errno;
      cleanup_temp(parent_fd, temp_name, temp_created);
      close(parent_fd);
      return EMIT_AFTER_PARENT("target_changed", saved_errno, "target could not be atomically swapped");
    }

    struct stat target_stat = {0};
    int target_stat_result = fstatat(parent_fd, temp_name, &target_stat, AT_SYMLINK_NOFOLLOW);
    unsigned long long actual_mtime_ns = (unsigned long long)target_stat.st_mtimespec.tv_sec * 1000000000ULL + (unsigned long long)target_stat.st_mtimespec.tv_nsec;
    int revision_matches = target_stat_result == 0 &&
      (unsigned long long)target_stat.st_dev == expected_dev &&
      (unsigned long long)target_stat.st_ino == expected_ino &&
      (unsigned long long)target_stat.st_mode == expected_mode &&
      (unsigned long long)target_stat.st_size == expected_size &&
      actual_mtime_ns == expected_mtime_ns;
    if (!revision_matches) {
      int restored = renameatx_np(parent_fd, temp_name, parent_fd, target_name, RENAME_SWAP) == 0;
      char detail[1024];
      if (restored) {
        snprintf(detail, sizeof(detail), "target revision changed during atomic swap; original target was restored");
        cleanup_temp(parent_fd, temp_name, temp_created);
      } else {
        snprintf(detail, sizeof(detail), "target revision changed; previous entry remains at %s", temp_name);
        /* temp_name contains the previous target and must be preserved. */
        temp_created = 0;
      }
      fsync(parent_fd);
      close(parent_fd);
      return emit_result_with_mutation("target_changed", 0, detail, parent_did_mutate || !restored);
    }

    if (unlinkat(parent_fd, temp_name, 0) != 0) {
      char detail[1024];
      snprintf(detail, sizeof(detail), "new target installed; previous entry remains as %s", temp_name);
      fsync(parent_fd);
      close(parent_fd);
      return emit_result_with_mutation("quarantine_cleanup_failed", 0, detail, 1);
    }
    temp_created = 0;
  }

  if (fsync(parent_fd) != 0) {
    int saved_errno = errno;
    close(parent_fd);
    return emit_result_with_mutation("parent_fsync_failed", saved_errno, "parent directory could not be synced", 1);
  }

  if (close(parent_fd) != 0) {
    return emit_result_with_mutation("parent_fsync_failed", errno, "parent directory could not be closed", 1);
  }

  return emit_result_with_mutation("ok", 0, "ok", 1);
}
