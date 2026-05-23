const updateOwner = process.env.AURA_UPDATE_OWNER || process.env.GITHUB_REPOSITORY_OWNER || 'murofixbhop-dot';
const updateRepo = process.env.AURA_UPDATE_REPO || 'AuraDesktop';

const config = {
  appId: 'com.aura.messenger.desktop',
  productName: 'Aura Messenger',
  copyright: 'Copyright © 2026 Aura',
  asar: true,
  directories: {
    output: 'dist',
    buildResources: 'build'
  },
  files: [
    'src/**/*',
    'build/icon.svg',
    'package.json'
  ],
  extraResources: [
    {
      from: 'build/icon.ico',
      to: 'icon.ico'
    },
    {
      from: 'build/icon.png',
      to: 'icon.png'
    }
  ],
  win: {
    icon: 'build/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ],
    artifactName: 'Aura-Messenger-${version}-${arch}.${ext}',
    requestedExecutionLevel: 'asInvoker'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Aura Messenger',
    deleteAppDataOnUninstall: false
  },
  portable: {
    artifactName: 'Aura-Messenger-Portable-${version}-${arch}.${ext}'
  }
};

if (updateOwner) {
  config.publish = [
    {
      provider: 'github',
      owner: updateOwner,
      repo: updateRepo
    }
  ];
}

module.exports = config;
