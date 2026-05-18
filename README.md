# NativeComposeChat

React Native 0.86 new-architecture benchmark app for a native-owned chat list.

The app exercises a Fabric component named `ComposeChatList`:

- Android renders the list with Jetpack Compose `LazyColumn`.
- iOS renders the list with SwiftUI `LazyVStack`.
- Native owns scrolling, visible-window tracking, skeleton rows, dirty rows, and row recycling/content types.
- React Native renders JSX cells on demand when native asks for visible or dirty indices.
- Android has a second minimal React Native runtime for the background-list benchmark tab, and that runtime mounts its own JSX cells into the visible native list.

## Running

Install dependencies, then run the normal React Native commands:

```sh
npm install
npm run android
npm run ios
```

Release builds used for smoke testing:

```sh
cd android
./gradlew :app:assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

Maestro flows live under `maestro/`:

```sh
npm run maestro
```

`maestro` must be installed separately.

## API Docs

See [docs/native-list-api.md](docs/native-list-api.md) for:

- Component props and commands.
- Data operation/versioning contract.
- Render request and dirty-item behavior.
- Android second-runtime module selection.
- Current platform notes and limitations.
