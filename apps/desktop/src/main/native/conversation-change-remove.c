#define _DARWIN_C_SOURCE

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#ifdef __APPLE__
#include <sys/stdio.h>
#endif

#ifndef O_CLOEXEC
#define O_CLOEXEC 0
#endif

#define MANIFEST_HEADER "TCREMOVE2\t"
#define MAX_MANIFEST_ENTRIES 1000000ULL

typedef struct {
  char *path;
  char kind;
  unsigned long long dev;
  unsigned long long ino;
  unsigned long long mode;
  unsigned long long size;
  unsigned long long mtime_ns;
  unsigned long long ctime_ns;
  int seen;
} manifest_entry;

static int did_mutate = 0;

static const char *errno_name(int value) {
  switch (value) {
    case 0: return "NONE";
    case EACCES: return "EACCES";
    case EBADF: return "EBADF";
    case EIO: return "EIO";
    case EISDIR: return "EISDIR";
    case ELOOP: return "ELOOP";
    case ENAMETOOLONG: return "ENAMETOOLONG";
    case ENOENT: return "ENOENT";
    case ENOMEM: return "ENOMEM";
    case ENOTDIR: return "ENOTDIR";
    case ENOTEMPTY: return "ENOTEMPTY";
    case EPERM: return "EPERM";
    case EINVAL: return "EINVAL";
    default: return "UNKNOWN";
  }
}

static void print_json_string(const char *value) {
  putchar('"');
  for (const unsigned char *cursor = (const unsigned char *)value; *cursor != '\0'; cursor += 1) {
    switch (*cursor) {
      case '\\': fputs("\\\\", stdout); break;
      case '"': fputs("\\\"", stdout); break;
      case '\b': fputs("\\b", stdout); break;
      case '\f': fputs("\\f", stdout); break;
      case '\n': fputs("\\n", stdout); break;
      case '\r': fputs("\\r", stdout); break;
      case '\t': fputs("\\t", stdout); break;
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

static int emit_result(const char *status, int errnum, const char *detail) {
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

static int is_safe_basename(const char *value) {
  return value[0] != '\0' && strcmp(value, ".") != 0 && strcmp(value, "..") != 0 && strchr(value, '/') == NULL;
}

static int is_safe_relative_path(const char *value) {
  if (value[0] == '\0' || value[0] == '/') {
    return 0;
  }
  const char *component = value;
  for (const char *cursor = value;; cursor += 1) {
    if (*cursor == '/' || *cursor == '\0') {
      size_t length = (size_t)(cursor - component);
      if (
        length == 0 ||
        (length == 1 && component[0] == '.') ||
        (length == 2 && component[0] == '.' && component[1] == '.')
      ) {
        return 0;
      }
      if (*cursor == '\0') {
        return 1;
      }
      component = cursor + 1;
    }
  }
}

static int same_identity(const struct stat *left, const struct stat *right) {
  return left->st_dev == right->st_dev && left->st_ino == right->st_ino && ((left->st_mode & S_IFMT) == (right->st_mode & S_IFMT));
}

static int rename_exclusive(int directory_fd, const char *from, const char *to) {
#ifdef __APPLE__
  return renameatx_np(directory_fd, from, directory_fd, to, RENAME_EXCL);
#else
  struct stat existing;
  if (fstatat(directory_fd, to, &existing, AT_SYMLINK_NOFOLLOW) == 0) {
    errno = EEXIST;
    return -1;
  }
  if (errno != ENOENT) return -1;
  return renameat(directory_fd, from, directory_fd, to);
#endif
}

static int quarantine_target(int parent_fd, const char *target_name, char *quarantine_name, size_t capacity) {
  for (unsigned int attempt = 0; attempt < 128; attempt += 1) {
    int written = snprintf(
      quarantine_name,
      capacity,
      ".teamcow-discard-%ld-%u",
      (long)getpid(),
      attempt
    );
    if (written < 0 || (size_t)written >= capacity) {
      errno = ENAMETOOLONG;
      return -1;
    }
    if (rename_exclusive(parent_fd, target_name, quarantine_name) == 0) {
      did_mutate = 1;
      return 0;
    }
    if (errno != EEXIST) return -1;
  }
  errno = EEXIST;
  return -1;
}

static void restore_quarantined_target(int parent_fd, const char *quarantine_name, const char *target_name) {
  if (rename_exclusive(parent_fd, quarantine_name, target_name) == 0) {
    did_mutate = 0;
  }
}

static char kind_for_mode(mode_t mode) {
  if (S_ISDIR(mode)) return 'd';
  if (S_ISLNK(mode)) return 'l';
  if (S_ISREG(mode)) return 'f';
  return 'o';
}

static int compare_manifest_entries(const void *left, const void *right) {
  const manifest_entry *left_entry = (const manifest_entry *)left;
  const manifest_entry *right_entry = (const manifest_entry *)right;
  return strcmp(left_entry->path, right_entry->path);
}

static manifest_entry *find_manifest_entry(manifest_entry *entries, size_t count, const char *path) {
  manifest_entry key = {
    .path = (char *)path,
    .kind = 0,
    .dev = 0,
    .ino = 0,
    .mode = 0,
    .size = 0,
    .mtime_ns = 0,
    .ctime_ns = 0,
    .seen = 0
  };
  return (manifest_entry *)bsearch(&key, entries, count, sizeof(manifest_entry), compare_manifest_entries);
}

static void reset_manifest_seen(manifest_entry *entries, size_t count) {
  for (size_t index = 0; index < count; index += 1) {
    entries[index].seen = 0;
  }
}

static int all_manifest_entries_seen(manifest_entry *entries, size_t count) {
  for (size_t index = 0; index < count; index += 1) {
    if (!entries[index].seen) {
      return 0;
    }
  }
  return 1;
}

static void free_manifest(manifest_entry *entries, size_t count) {
  if (entries == NULL) return;
  for (size_t index = 0; index < count; index += 1) {
    free(entries[index].path);
  }
  free(entries);
}

static int hex_value(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  return -1;
}

static char *decode_hex_path(const char *hex) {
  size_t hex_length = strlen(hex);
  if (hex_length == 0 || hex_length % 2 != 0) return NULL;
  size_t path_length = hex_length / 2;
  char *path = (char *)malloc(path_length + 1);
  if (path == NULL) return NULL;
  for (size_t index = 0; index < path_length; index += 1) {
    int high = hex_value(hex[index * 2]);
    int low = hex_value(hex[index * 2 + 1]);
    if (high < 0 || low < 0 || (high == 0 && low == 0)) {
      free(path);
      return NULL;
    }
    path[index] = (char)((high << 4) | low);
  }
  path[path_length] = '\0';
  if (!is_safe_relative_path(path)) {
    free(path);
    return NULL;
  }
  return path;
}

static int parse_manifest(manifest_entry **out_entries, size_t *out_count, const char **detail) {
  char *line = NULL;
  size_t capacity = 0;
  ssize_t length = getline(&line, &capacity, stdin);
  if (length < 0) {
    free(line);
    *detail = "manifest header was missing";
    return -1;
  }
  while (length > 0 && (line[length - 1] == '\n' || line[length - 1] == '\r')) line[--length] = '\0';
  if (strncmp(line, MANIFEST_HEADER, strlen(MANIFEST_HEADER)) != 0) {
    free(line);
    *detail = "manifest header was invalid";
    return -1;
  }

  unsigned long long parsed_count = 0;
  if (parse_ull(line + strlen(MANIFEST_HEADER), &parsed_count) != 0 || parsed_count > MAX_MANIFEST_ENTRIES) {
    free(line);
    *detail = "manifest count was invalid";
    return -1;
  }
  size_t count = (size_t)parsed_count;
  manifest_entry *entries = count == 0 ? NULL : (manifest_entry *)calloc(count, sizeof(manifest_entry));
  if (count > 0 && entries == NULL) {
    free(line);
    *detail = "manifest entries could not be allocated";
    return -1;
  }

  for (size_t index = 0; index < count; index += 1) {
    length = getline(&line, &capacity, stdin);
    if (length < 0) {
      free(line);
      free_manifest(entries, count);
      *detail = "manifest ended before all entries were read";
      return -1;
    }
    while (length > 0 && (line[length - 1] == '\n' || line[length - 1] == '\r')) line[--length] = '\0';
    char *kind_text = strchr(line, '\t');
    if (kind_text == NULL) {
      free(line);
      free_manifest(entries, count);
      *detail = "manifest entry fields were missing";
      return -1;
    }
    *kind_text++ = '\0';
    char *dev_text = strchr(kind_text, '\t');
    if (dev_text == NULL) {
      free(line);
      free_manifest(entries, count);
      *detail = "manifest entry device was missing";
      return -1;
    }
    *dev_text++ = '\0';
    char *ino_text = strchr(dev_text, '\t');
    if (ino_text == NULL) {
      free(line);
      free_manifest(entries, count);
      *detail = "manifest entry inode fields were invalid";
      return -1;
    }
    *ino_text++ = '\0';
    char *mode_text = strchr(ino_text, '\t');
    char *size_text = mode_text == NULL ? NULL : strchr(mode_text + 1, '\t');
    char *mtime_text = size_text == NULL ? NULL : strchr(size_text + 1, '\t');
    char *ctime_text = mtime_text == NULL ? NULL : strchr(mtime_text + 1, '\t');
    if (mode_text == NULL || size_text == NULL || mtime_text == NULL || ctime_text == NULL || strchr(ctime_text + 1, '\t') != NULL) {
      free(line);
      free_manifest(entries, count);
      *detail = "manifest entry revision fields were invalid";
      return -1;
    }
    *mode_text++ = '\0';
    *size_text++ = '\0';
    *mtime_text++ = '\0';
    *ctime_text++ = '\0';
    entries[index].path = decode_hex_path(line);
    if (
      entries[index].path == NULL ||
      strlen(kind_text) != 1 ||
      strchr("dflo", kind_text[0]) == NULL ||
      parse_ull(dev_text, &entries[index].dev) != 0 ||
      parse_ull(ino_text, &entries[index].ino) != 0 ||
      parse_ull(mode_text, &entries[index].mode) != 0 ||
      parse_ull(size_text, &entries[index].size) != 0 ||
      parse_ull(mtime_text, &entries[index].mtime_ns) != 0 ||
      parse_ull(ctime_text, &entries[index].ctime_ns) != 0
    ) {
      free(line);
      free_manifest(entries, count);
      *detail = "manifest entry was invalid";
      return -1;
    }
    entries[index].kind = kind_text[0];
  }

  if (getline(&line, &capacity, stdin) >= 0) {
    free(line);
    free_manifest(entries, count);
    *detail = "manifest contained extra entries";
    return -1;
  }
  free(line);
  qsort(entries, count, sizeof(manifest_entry), compare_manifest_entries);
  for (size_t index = 1; index < count; index += 1) {
    if (strcmp(entries[index - 1].path, entries[index].path) == 0) {
      free_manifest(entries, count);
      *detail = "manifest contained duplicate paths";
      return -1;
    }
  }
  *out_entries = entries;
  *out_count = count;
  return 0;
}

static unsigned long long stat_mtime_ns(const struct stat *stats) {
#ifdef __APPLE__
  return ((unsigned long long)stats->st_mtimespec.tv_sec * 1000000000ULL) + (unsigned long long)stats->st_mtimespec.tv_nsec;
#else
  return ((unsigned long long)stats->st_mtim.tv_sec * 1000000000ULL) + (unsigned long long)stats->st_mtim.tv_nsec;
#endif
}

static unsigned long long stat_ctime_ns(const struct stat *stats) {
#ifdef __APPLE__
  return ((unsigned long long)stats->st_ctimespec.tv_sec * 1000000000ULL) + (unsigned long long)stats->st_ctimespec.tv_nsec;
#else
  return ((unsigned long long)stats->st_ctim.tv_sec * 1000000000ULL) + (unsigned long long)stats->st_ctim.tv_nsec;
#endif
}

static int same_revision(const struct stat *left, const struct stat *right) {
  return same_identity(left, right) &&
    left->st_mode == right->st_mode &&
    left->st_size == right->st_size &&
    stat_mtime_ns(left) == stat_mtime_ns(right) &&
    stat_ctime_ns(left) == stat_ctime_ns(right);
}

static int same_content_revision(const struct stat *left, const struct stat *right) {
  return same_identity(left, right) &&
    left->st_mode == right->st_mode &&
    left->st_size == right->st_size &&
    stat_mtime_ns(left) == stat_mtime_ns(right);
}

static char *join_relative_path(const char *prefix, const char *name) {
  size_t prefix_length = strlen(prefix);
  size_t name_length = strlen(name);
  size_t total = prefix_length + (prefix_length == 0 ? 0 : 1) + name_length + 1;
  char *path = (char *)malloc(total);
  if (path == NULL) return NULL;
  if (prefix_length == 0) {
    memcpy(path, name, name_length + 1);
  } else {
    memcpy(path, prefix, prefix_length);
    path[prefix_length] = '/';
    memcpy(path + prefix_length + 1, name, name_length + 1);
  }
  return path;
}

static int set_failure(
  const char **status,
  const char **detail,
  int *errnum,
  const char *next_status,
  const char *next_detail,
  int next_errno
) {
  *status = next_status;
  *detail = next_detail;
  *errnum = next_errno;
  return -1;
}

static int validate_manifest_entry(
  manifest_entry *entry,
  const struct stat *stats,
  const char **status,
  const char **detail,
  int *errnum
) {
  if (entry == NULL) {
    return set_failure(status, detail, errnum, "manifest_mismatch", "directory contained an entry missing from the manifest", 0);
  }
  if (
    entry->seen ||
    entry->kind != kind_for_mode(stats->st_mode) ||
    entry->dev != (unsigned long long)stats->st_dev ||
    entry->ino != (unsigned long long)stats->st_ino ||
    entry->mode != (unsigned long long)stats->st_mode ||
    entry->size != (unsigned long long)stats->st_size ||
    entry->mtime_ns != stat_mtime_ns(stats) ||
    entry->ctime_ns != stat_ctime_ns(stats)
  ) {
    return set_failure(status, detail, errnum, "target_changed", "directory entry identity or type did not match the manifest", 0);
  }
  entry->seen = 1;
  return 0;
}

static int walk_manifest_tree(
  int directory_fd,
  const char *prefix,
  manifest_entry *entries,
  size_t count,
  int remove_entries,
  const char **status,
  const char **detail,
  int *errnum
) {
  if (lseek(directory_fd, 0, SEEK_SET) < 0) {
    return set_failure(status, detail, errnum, "directory_read_failed", "directory offset could not be reset", errno);
  }
  int stream_fd = dup(directory_fd);
  if (stream_fd < 0) {
    return set_failure(status, detail, errnum, "directory_read_failed", "directory descriptor could not be duplicated", errno);
  }
  DIR *directory = fdopendir(stream_fd);
  if (directory == NULL) {
    int saved_errno = errno;
    close(stream_fd);
    return set_failure(status, detail, errnum, "directory_read_failed", "directory could not be opened for iteration", saved_errno);
  }

  for (;;) {
    errno = 0;
    struct dirent *entry = readdir(directory);
    if (entry == NULL) {
      if (errno != 0) {
        int saved_errno = errno;
        closedir(directory);
        return set_failure(status, detail, errnum, "directory_read_failed", "directory iteration failed", saved_errno);
      }
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;

    char *relative_path = join_relative_path(prefix, entry->d_name);
    if (relative_path == NULL) {
      closedir(directory);
      return set_failure(status, detail, errnum, "directory_read_failed", "relative entry path could not be allocated", ENOMEM);
    }
    struct stat before_stat;
    if (fstatat(directory_fd, entry->d_name, &before_stat, AT_SYMLINK_NOFOLLOW) != 0) {
      int saved_errno = errno;
      free(relative_path);
      closedir(directory);
      return set_failure(status, detail, errnum, "target_changed", "directory entry could not be inspected", saved_errno);
    }
    manifest_entry *expected = find_manifest_entry(entries, count, relative_path);
    if (validate_manifest_entry(expected, &before_stat, status, detail, errnum) != 0) {
      free(relative_path);
      closedir(directory);
      return -1;
    }

    if (S_ISDIR(before_stat.st_mode)) {
      int child_fd = openat(directory_fd, entry->d_name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
      if (child_fd < 0) {
        int saved_errno = errno;
        free(relative_path);
        closedir(directory);
        return set_failure(status, detail, errnum, "target_changed", "child directory could not be opened safely", saved_errno);
      }
      struct stat opened_stat;
      if (fstat(child_fd, &opened_stat) != 0) {
        int saved_errno = errno;
        close(child_fd);
        free(relative_path);
        closedir(directory);
        return set_failure(status, detail, errnum, "target_changed", "child directory could not be inspected", saved_errno);
      }
      if (!same_identity(&before_stat, &opened_stat)) {
        close(child_fd);
        free(relative_path);
        closedir(directory);
        return set_failure(status, detail, errnum, "target_changed", "child directory changed before traversal", 0);
      }
      if (walk_manifest_tree(child_fd, relative_path, entries, count, remove_entries, status, detail, errnum) != 0) {
        close(child_fd);
        free(relative_path);
        closedir(directory);
        return -1;
      }
      if (remove_entries) {
        struct stat current_stat;
        if (fstatat(directory_fd, entry->d_name, &current_stat, AT_SYMLINK_NOFOLLOW) != 0) {
          int saved_errno = errno;
          close(child_fd);
          free(relative_path);
          closedir(directory);
          return set_failure(status, detail, errnum, "target_changed", "child directory disappeared before removal", saved_errno);
        }
        if (!same_identity(&opened_stat, &current_stat)) {
          close(child_fd);
          free(relative_path);
          closedir(directory);
          return set_failure(status, detail, errnum, "target_changed", "child directory changed before removal", 0);
        }
        if (unlinkat(directory_fd, entry->d_name, AT_REMOVEDIR) != 0) {
          int saved_errno = errno;
          close(child_fd);
          free(relative_path);
          closedir(directory);
          return set_failure(status, detail, errnum, "remove_failed", "child directory could not be removed", saved_errno);
        }
        did_mutate = 1;
      }
      close(child_fd);
    } else if (remove_entries) {
      struct stat current_stat;
      if (fstatat(directory_fd, entry->d_name, &current_stat, AT_SYMLINK_NOFOLLOW) != 0) {
        int saved_errno = errno;
        free(relative_path);
        closedir(directory);
        return set_failure(status, detail, errnum, "target_changed", "directory entry disappeared before removal", saved_errno);
      }
      if (!same_revision(&before_stat, &current_stat)) {
        free(relative_path);
        closedir(directory);
        return set_failure(status, detail, errnum, "target_changed", "directory entry changed before removal", 0);
      }
      if (unlinkat(directory_fd, entry->d_name, 0) != 0) {
        int saved_errno = errno;
        free(relative_path);
        closedir(directory);
        return set_failure(status, detail, errnum, "remove_failed", "directory entry could not be removed", saved_errno);
      }
      did_mutate = 1;
    }
    free(relative_path);
  }

  if (closedir(directory) != 0) {
    return set_failure(status, detail, errnum, "directory_read_failed", "directory stream could not be closed", errno);
  }
  return 0;
}

static int open_parent_from_root(
  const char *root_path,
  const char *relative_parent_path,
  unsigned long long expected_root_dev,
  unsigned long long expected_root_ino,
  int *out_fd
) {
  int current_fd = open(root_path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (current_fd < 0) return emit_result("root_open_failed", errno, "root directory could not be opened");
  struct stat root_stat;
  if (fstat(current_fd, &root_stat) != 0) {
    int saved_errno = errno;
    close(current_fd);
    return emit_result("root_open_failed", saved_errno, "root directory could not be inspected");
  }
  if (
    (unsigned long long)root_stat.st_dev != expected_root_dev ||
    (unsigned long long)root_stat.st_ino != expected_root_ino
  ) {
    close(current_fd);
    return emit_result("root_changed", 0, "root directory changed before removal");
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
    if (!is_safe_basename(component)) {
      free(path_copy);
      close(current_fd);
      return emit_result("parent_open_failed", 0, "parent path contains an unsafe component");
    }
    int next_fd = openat(current_fd, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (next_fd < 0) {
      int saved_errno = errno;
      free(path_copy);
      close(current_fd);
      return emit_result("parent_open_failed", saved_errno, "parent directory component could not be opened");
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
  if (argc != 12) {
    return emit_result("usage_error", 0, "expected rootPath relativeParentPath targetBaseName and target revision fields");
  }

  const char *root_path = argv[1];
  const char *relative_parent_path = argv[2];
  const char *target_name = argv[3];
  unsigned long long expected_root_dev = 0;
  unsigned long long expected_root_ino = 0;
  unsigned long long expected_target_dev = 0;
  unsigned long long expected_target_ino = 0;
  unsigned long long expected_target_mode = 0;
  unsigned long long expected_target_size = 0;
  unsigned long long expected_target_mtime_ns = 0;
  unsigned long long expected_target_ctime_ns = 0;
  if (
    !is_safe_basename(target_name) ||
    parse_ull(argv[4], &expected_root_dev) != 0 ||
    parse_ull(argv[5], &expected_root_ino) != 0 ||
    parse_ull(argv[6], &expected_target_dev) != 0 ||
    parse_ull(argv[7], &expected_target_ino) != 0 ||
    parse_ull(argv[8], &expected_target_mode) != 0 ||
    parse_ull(argv[9], &expected_target_size) != 0 ||
    parse_ull(argv[10], &expected_target_mtime_ns) != 0 ||
    parse_ull(argv[11], &expected_target_ctime_ns) != 0
  ) {
    return emit_result("usage_error", 0, "target name, dev, or ino could not be parsed");
  }

  manifest_entry *manifest = NULL;
  size_t manifest_count = 0;
  const char *manifest_detail = "manifest could not be parsed";
  if (parse_manifest(&manifest, &manifest_count, &manifest_detail) != 0) {
    return emit_result("manifest_invalid", 0, manifest_detail);
  }

  int parent_fd = -1;
  int parent_result = open_parent_from_root(
    root_path,
    relative_parent_path,
    expected_root_dev,
    expected_root_ino,
    &parent_fd
  );
  if (parent_result != 0) {
    free_manifest(manifest, manifest_count);
    return parent_result;
  }

  struct stat target_stat;
  if (fstatat(parent_fd, target_name, &target_stat, AT_SYMLINK_NOFOLLOW) != 0) {
    int saved_errno = errno;
    close(parent_fd);
    free_manifest(manifest, manifest_count);
    return emit_result("target_changed", saved_errno, "target entry could not be inspected");
  }
  if (
    (unsigned long long)target_stat.st_dev != expected_target_dev ||
    (unsigned long long)target_stat.st_ino != expected_target_ino ||
    (unsigned long long)target_stat.st_mode != expected_target_mode ||
    (unsigned long long)target_stat.st_size != expected_target_size ||
    stat_mtime_ns(&target_stat) != expected_target_mtime_ns ||
    stat_ctime_ns(&target_stat) != expected_target_ctime_ns
  ) {
    close(parent_fd);
    free_manifest(manifest, manifest_count);
    return emit_result("target_changed", 0, "target entry changed before removal");
  }

  char quarantine_name[128];
  if (quarantine_target(parent_fd, target_name, quarantine_name, sizeof(quarantine_name)) != 0) {
    int saved_errno = errno;
    close(parent_fd);
    free_manifest(manifest, manifest_count);
    return emit_result("target_changed", saved_errno, "target entry could not be quarantined safely");
  }
  struct stat quarantined_stat;
  if (fstatat(parent_fd, quarantine_name, &quarantined_stat, AT_SYMLINK_NOFOLLOW) != 0) {
    int saved_errno = errno;
    restore_quarantined_target(parent_fd, quarantine_name, target_name);
    close(parent_fd);
    free_manifest(manifest, manifest_count);
    return emit_result("target_changed", saved_errno, "quarantined target could not be inspected");
  }
  /* Renaming can update ctime; content, mode, size, and mtime must stay stable. */
  if (!same_content_revision(&target_stat, &quarantined_stat)) {
    restore_quarantined_target(parent_fd, quarantine_name, target_name);
    close(parent_fd);
    free_manifest(manifest, manifest_count);
    return emit_result("target_changed", 0, "target entry changed while it was quarantined");
  }

  if (S_ISDIR(target_stat.st_mode)) {
    int target_fd = openat(parent_fd, quarantine_name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (target_fd < 0) {
      int saved_errno = errno;
      restore_quarantined_target(parent_fd, quarantine_name, target_name);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("target_changed", saved_errno, "target directory could not be opened safely");
    }
    struct stat opened_stat;
    if (fstat(target_fd, &opened_stat) != 0) {
      int saved_errno = errno;
      close(target_fd);
      restore_quarantined_target(parent_fd, quarantine_name, target_name);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("target_changed", saved_errno, "target directory could not be inspected");
    }
    if (!same_identity(&target_stat, &opened_stat)) {
      close(target_fd);
      restore_quarantined_target(parent_fd, quarantine_name, target_name);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("target_changed", 0, "target directory changed before preflight");
    }

    const char *status = "manifest_mismatch";
    const char *detail = "directory did not match the manifest";
    int errnum = 0;
    reset_manifest_seen(manifest, manifest_count);
    if (
      walk_manifest_tree(target_fd, "", manifest, manifest_count, 0, &status, &detail, &errnum) != 0 ||
      !all_manifest_entries_seen(manifest, manifest_count)
    ) {
      close(target_fd);
      restore_quarantined_target(parent_fd, quarantine_name, target_name);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result(status, errnum, detail);
    }

    reset_manifest_seen(manifest, manifest_count);
    if (
      walk_manifest_tree(target_fd, "", manifest, manifest_count, 1, &status, &detail, &errnum) != 0 ||
      !all_manifest_entries_seen(manifest, manifest_count)
    ) {
      close(target_fd);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result(status, errnum, detail);
    }
    struct stat current_stat;
    if (fstatat(parent_fd, quarantine_name, &current_stat, AT_SYMLINK_NOFOLLOW) != 0) {
      int saved_errno = errno;
      close(target_fd);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("target_changed", saved_errno, "target directory disappeared before removal");
    }
    if (!same_identity(&opened_stat, &current_stat)) {
      close(target_fd);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("target_changed", 0, "target directory changed before removal");
    }
    if (unlinkat(parent_fd, quarantine_name, AT_REMOVEDIR) != 0) {
      int saved_errno = errno;
      close(target_fd);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("remove_failed", saved_errno, "target directory could not be removed");
    }
    close(target_fd);
  } else {
    if (manifest_count != 0) {
      restore_quarantined_target(parent_fd, quarantine_name, target_name);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("manifest_mismatch", 0, "non-directory target requires an empty manifest");
    }
    struct stat current_stat;
    if (fstatat(parent_fd, quarantine_name, &current_stat, AT_SYMLINK_NOFOLLOW) != 0 || !same_content_revision(&target_stat, &current_stat)) {
      int saved_errno = errno;
      restore_quarantined_target(parent_fd, quarantine_name, target_name);
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("target_changed", saved_errno, "quarantined target changed before removal");
    }
    if (unlinkat(parent_fd, quarantine_name, 0) != 0) {
      int saved_errno = errno;
      close(parent_fd);
      free_manifest(manifest, manifest_count);
      return emit_result("remove_failed", saved_errno, "target entry could not be removed");
    }
  }

  free_manifest(manifest, manifest_count);
  if (fsync(parent_fd) != 0) {
    int saved_errno = errno;
    close(parent_fd);
    return emit_result("parent_fsync_failed", saved_errno, "parent directory could not be synced");
  }
  if (close(parent_fd) != 0) {
    return emit_result("parent_fsync_failed", errno, "parent directory could not be closed");
  }
  return emit_result("ok", 0, "ok");
}
