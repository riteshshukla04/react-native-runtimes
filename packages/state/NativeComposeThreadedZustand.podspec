require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NativeComposeThreadedZustand"
  s.version      = package["version"]
  s.summary      = "Cross-runtime Zustand-style store backed by C++ and Nitro."
  s.homepage     = "https://github.com/react-native-runtimes/state"
  s.license      = "MIT"
  s.authors      = "Native Compose"

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/react-native-runtimes/state.git", :tag => "#{s.version}" }
  s.source_files = [
    "ios/**/*.{h,m,mm,cpp}",
    "android/src/main/jni/SharedZustandStore.{h,cpp}",
    "android/src/main/jni/SharedZustandNitroStore.{h,cpp}",
  ]
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "DEFINES_MODULE" => "YES",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/NitroModules/cpp/core\" \"$(PODS_ROOT)/NitroModules/cpp/jsi\" \"$(PODS_ROOT)/NitroModules/cpp/prototype\" \"$(PODS_ROOT)/NitroModules/cpp/registry\" \"$(PODS_ROOT)/NitroModules/cpp/templates\" \"$(PODS_ROOT)/NitroModules/cpp/utils\"",
  }

  install_modules_dependencies(s)
  s.dependency "NitroModules"
end
