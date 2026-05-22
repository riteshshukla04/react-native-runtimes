# Native Compose Runtimes Docs

Docusaurus documentation for the threaded runtime and shared Zustand packages.

```sh
cd website
npm install
npm run start
```

Create a production build:

```sh
npm run build
```

Create a local/shareable HTML build that works at `http://localhost:8080/`:

```sh
npm run build:local
cd build
python3 -m http.server 8080
```

## GitHub Pages

Docs are published from GitHub Actions to:

```txt
https://szymon20000.github.io/react-native-runtimes/
```

In the repository settings, set **Pages** source to **GitHub Actions**. The
workflow runs on pushes to `main` when `website/**` or the docs workflow changes,
and it can also be started manually from the Actions tab.
