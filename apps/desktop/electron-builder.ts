export const createElectronBuilderConfig = (env: NodeJS.ProcessEnv = process.env) => {
  const hasSigningIdentity = Boolean(env.CSC_LINK || env.CSC_NAME)
  const hasNotarizationCredentials = Boolean(
    (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) ||
    (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) ||
    env.APPLE_KEYCHAIN_PROFILE
  )

  return {
    appId: "com.teamcow.desktop",
    productName: "TeamCow",
    directories: {
      output: "release",
      buildResources: "build"
    },
    npmRebuild: false,
    forceCodeSigning: hasSigningIdentity,
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
      icon: "build/icon.icns",
      entitlements: "build/entitlements.mac.plist",
      entitlementsInherit: "build/entitlements.mac.inherit.plist",
      identity: hasSigningIdentity ? undefined : "-",
      hardenedRuntime: hasSigningIdentity,
      notarize: hasNotarizationCredentials
    },
    publish: [
      {
        provider: "generic",
        url: "https://updates.teamcow.local/download",
        channel: "latest"
      }
    ]
  }
}

export default createElectronBuilderConfig()
