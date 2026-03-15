module.exports = {
  appId: 'com.mouse.groundcontrol',
  productName: 'M.O.U.S.E. Ground Control Station',
  directories: {
    output: 'electron-dist',
    buildResources: 'electron'
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json',
    '!node_modules/**/*',
    'node_modules/**/*.node'
  ],
  asar: true,
  asarUnpack: [
    '**/*.node'
  ],
  win: {
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
    icon: 'electron/icon.png',
    artifactName: '${productName}-${version}-Windows.${ext}'
  },
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      }
    ],
    icon: 'electron/icon.png',
    category: 'public.app-category.utilities',
    artifactName: '${productName}-${version}-Mac.${ext}'
  },
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      }
    ],
    icon: 'electron/icon.png',
    category: 'Utility',
    artifactName: '${productName}-${version}-Linux.${ext}'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'M.O.U.S.E. GCS'
  },
  dmg: {
    contents: [
      {
        x: 130,
        y: 220
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications'
      }
    ]
  }
};
