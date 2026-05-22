#include "ThreadedRuntimeNitroFunctions.h"

#include "RuntimeFunctionJsi.h"
#include "RuntimeFunctionScheduler.h"

#include <NitroModules/HybridObject.hpp>
#include <NitroModules/HybridObjectRegistry.hpp>
#include <NitroModules/Promise.hpp>
#include <NitroModules/Dispatcher.hpp>

#include <memory>
#include <string>

namespace nativecompose::threadedruntime {

namespace {

class ThreadedRuntimeFunctions final : public margelo::nitro::HybridObject {
 public:
  static constexpr auto TAG = "ThreadedRuntimeFunctions";

  ThreadedRuntimeFunctions() : HybridObject(TAG) {}

  facebook::jsi::Value install(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value & /*thisValue*/,
      const facebook::jsi::Value *args,
      size_t count) {
    std::string runtimeName;
    if (count > 0 && args[0].isString()) {
      runtimeName = args[0].asString(runtime).utf8(runtime);
    }

    installRuntimeFunctionJsi(runtime, runtimeName);
    try {
      registerRuntimeDispatcher(
          runtimeName,
          runtime,
          margelo::nitro::Dispatcher::getRuntimeGlobalDispatcher(runtime));
    } catch (...) {
      // The runtime can still use the local JSI cache even if Nitro has not
      // installed a dispatcher for cross-runtime scheduling yet.
    }
    return facebook::jsi::Value::undefined();
  }

  std::shared_ptr<margelo::nitro::Promise<std::string>> run(
      const std::string &runtimeName,
      const std::string &functionId,
      const std::string &argsJson) {
    return callRuntimeFunctionOnRuntime(runtimeName, functionId, argsJson);
  }

 protected:
  void loadHybridMethods() override {
    HybridObject::loadHybridMethods();
    registerHybrids(this, [](margelo::nitro::Prototype &prototype) {
      prototype.registerRawHybridMethod(
          "install",
          1,
          &ThreadedRuntimeFunctions::install);
      prototype.registerHybridMethod("run", &ThreadedRuntimeFunctions::run);
    });
  }
};

} // namespace

void registerThreadedRuntimeNitroFunctions() {
  margelo::nitro::HybridObjectRegistry::registerHybridObjectConstructor(
      ThreadedRuntimeFunctions::TAG,
      []() -> std::shared_ptr<margelo::nitro::HybridObject> {
        return std::make_shared<ThreadedRuntimeFunctions>();
      });
}

} // namespace nativecompose::threadedruntime
