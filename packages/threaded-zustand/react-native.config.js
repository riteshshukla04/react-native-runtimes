module.exports = {
  dependency: {
    platforms: {
      android: {
        packageImportPath:
          'import com.nativecompose.threadedzustand.ThreadedZustandPackage;',
        packageInstance: 'new ThreadedZustandPackage()',
      },
      ios: null,
    },
  },
};
