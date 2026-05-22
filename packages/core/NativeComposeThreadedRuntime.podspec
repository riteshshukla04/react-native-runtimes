require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NativeComposeThreadedRuntime"
  s.version      = package["version"]
  s.summary      = "Run selected React Native surfaces on a secondary runtime."
  s.homepage     = "https://github.com/react-native-runtimes/core"
  s.license      = "MIT"
  s.authors      = "Native Compose"

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/react-native-runtimes/core.git", :tag => "#{s.version}" }
  s.source_files = "ios/**/*.{h,m,mm,cpp}", "cpp/**/*.{h,hpp,cpp,mm}"
  s.public_header_files = "ios/**/*.h"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "DEFINES_MODULE" => "YES",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/NitroModules/cpp/core\" \"$(PODS_ROOT)/NitroModules/cpp/jsi\" \"$(PODS_ROOT)/NitroModules/cpp/prototype\" \"$(PODS_ROOT)/NitroModules/cpp/registry\" \"$(PODS_ROOT)/NitroModules/cpp/templates\" \"$(PODS_ROOT)/NitroModules/cpp/utils\"",
  }

  install_modules_dependencies(s)
  s.dependency "NitroModules"
  s.dependency "React-RCTAppDelegate"
end
