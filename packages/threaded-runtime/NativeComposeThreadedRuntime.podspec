require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NativeComposeThreadedRuntime"
  s.version      = package["version"]
  s.summary      = "Run selected React Native surfaces on a secondary runtime."
  s.homepage     = "https://github.com/native-compose/threaded-runtime"
  s.license      = "MIT"
  s.authors      = "Native Compose"

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/native-compose/threaded-runtime.git", :tag => "#{s.version}" }
  s.source_files = "ios/**/*.{h,m,mm,cpp}", "cpp/**/*.{h,hpp,cpp,mm}"
  s.public_header_files = "ios/**/*.h", "cpp/**/*.h", "cpp/**/*.hpp"
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }

  install_modules_dependencies(s)
  s.dependency "React-RCTAppDelegate"
end
