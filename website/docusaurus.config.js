// @ts-check

const config = {
  title: 'Native Compose Runtimes',
  tagline: 'Run React Native UI and state work across named JS runtimes.',

  url: 'https://native-compose.local',
  baseUrl: '/',

  organizationName: 'native-compose',
  projectName: 'react-native-runtimes',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Native Compose Runtimes',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'runtimeDocs',
          position: 'left',
          label: 'Docs',
        },
      ],
    },
    prism: {
      additionalLanguages: ['kotlin', 'swift', 'java'],
    },
  },
};

module.exports = config;
