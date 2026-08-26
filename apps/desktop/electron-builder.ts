export default {
  appId: "com.teamcow.desktop",
  productName: "TeamCow",
  directories: {
    output: "release",
    buildResources: "build"
  },
  npmRebuild: false,
  files: [
    "out/**/*"
  ],
  extraResources: [
    {
      from: "out/native",
      to: "native",
      filter: ["**/*"]
    },
    {
      from: "../../LICENSE",
      to: "LICENSE"
    },
    {
      from: "../../NOTICE",
      to: "NOTICE"
    },
    {
      from: "../../THIRD_PARTY_NOTICES.md",
      to: "THIRD_PARTY_NOTICES.md"
    }
  ],
  mac: {
    target: ["dmg", "zip"],
    artifactName: "${productName}-${version}-${arch}.${ext}",
    icon: "build/icon.icns"
  },
  publish: [
    {
      provider: "generic",
      url: "https://updates.teamcow.local/download",
      channel: "latest"
    }
  ]
}
