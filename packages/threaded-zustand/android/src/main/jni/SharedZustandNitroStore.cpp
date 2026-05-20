#include "SharedZustandNitroStore.h"

#include "SharedZustandStore.h"

#include <NitroModules/HybridObjectRegistry.hpp>
#include <NitroModules/JSIConverter+Optional.hpp>

namespace facebook::react {

SharedZustandNitroStore::SharedZustandNitroStore() : HybridObject(TAG) {}

std::optional<std::string> SharedZustandNitroStore::getState(
    const std::string& storeName,
    const std::string& subtreeKey) {
  const auto entry =
      SharedZustandStore::instance().getState(storeName, subtreeKey);
  if (!entry.has_value()) {
    return std::nullopt;
  }
  return entry->stateJson;
}

std::string SharedZustandNitroStore::getOrInitState(
    const std::string& storeName,
    const std::string& subtreeKey,
    const std::string& initialJson,
    const std::string& persistKey) {
  const auto entry = SharedZustandStore::instance().getOrInitState(
      storeName,
      subtreeKey,
      initialJson,
      persistKey.empty() ? std::nullopt : std::optional<std::string>(persistKey));
  return entry.stateJson;
}

int SharedZustandNitroStore::setState(
    const std::string& storeName,
    const std::string& subtreeKey,
    const std::string& stateJson) {
  return SharedZustandStore::instance()
      .setState(storeName, subtreeKey, stateJson)
      .revision;
}

int SharedZustandNitroStore::getRevision(
    const std::string& storeName,
    const std::string& subtreeKey) {
  return SharedZustandStore::instance().getRevision(storeName, subtreeKey);
}

int SharedZustandNitroStore::clear(
    const std::string& storeName,
    const std::string& subtreeKey) {
  return SharedZustandStore::instance().clear(storeName, subtreeKey);
}

void SharedZustandNitroStore::setPersistedState(
    const std::string& persistKey,
    const std::string& stateJson) {
  SharedZustandStore::instance().setPersistedState(persistKey, stateJson);
}

void SharedZustandNitroStore::clearPersistedState(
    const std::string& persistKey) {
  SharedZustandStore::instance().clearPersistedState(persistKey);
}

void SharedZustandNitroStore::loadHybridMethods() {
  HybridObject::loadHybridMethods();
  registerHybrids(this, [](margelo::nitro::Prototype& prototype) {
    prototype.registerHybridMethod("getState", &SharedZustandNitroStore::getState);
    prototype.registerHybridMethod(
        "getOrInitState", &SharedZustandNitroStore::getOrInitState);
    prototype.registerHybridMethod("setState", &SharedZustandNitroStore::setState);
    prototype.registerHybridMethod(
        "getRevision", &SharedZustandNitroStore::getRevision);
    prototype.registerHybridMethod("clear", &SharedZustandNitroStore::clear);
    prototype.registerHybridMethod(
        "setPersistedState", &SharedZustandNitroStore::setPersistedState);
    prototype.registerHybridMethod(
        "clearPersistedState", &SharedZustandNitroStore::clearPersistedState);
  });
}

void registerSharedZustandNitroStore() {
  margelo::nitro::HybridObjectRegistry::registerHybridObjectConstructor(
      SharedZustandNitroStore::TAG,
      []() -> std::shared_ptr<margelo::nitro::HybridObject> {
        return std::make_shared<SharedZustandNitroStore>();
      });
}

} // namespace facebook::react
