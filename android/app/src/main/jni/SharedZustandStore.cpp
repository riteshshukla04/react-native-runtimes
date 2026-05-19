#include "SharedZustandStore.h"

#include <utility>

namespace facebook::react {

SharedZustandStore& SharedZustandStore::instance() {
  static SharedZustandStore store;
  return store;
}

std::string SharedZustandStore::makeKey(
    const std::string& storeName,
    const std::string& subtreeKey) {
  return storeName + '\x1f' + subtreeKey;
}

std::shared_ptr<SharedZustandStore::Entry> SharedZustandStore::getOrCreateEntry(
    const std::string& storeName,
    const std::string& subtreeKey) {
  std::lock_guard<std::mutex> lock(registryMutex_);
  auto key = makeKey(storeName, subtreeKey);
  auto& entry = stores_[key];
  if (!entry) {
    entry = std::make_shared<Entry>();
  }
  return entry;
}

std::shared_ptr<SharedZustandStore::Entry> SharedZustandStore::findEntry(
    const std::string& storeName,
    const std::string& subtreeKey) {
  std::lock_guard<std::mutex> lock(registryMutex_);
  auto iterator = stores_.find(makeKey(storeName, subtreeKey));
  if (iterator == stores_.end()) {
    return nullptr;
  }
  return iterator->second;
}

SharedZustandStore::Snapshot SharedZustandStore::setState(
    const std::string& storeName,
    const std::string& subtreeKey,
    std::string stateJson) {
  auto entry = getOrCreateEntry(storeName, subtreeKey);
  std::lock_guard<std::mutex> lock(entry->mutex);
  entry->stateJson = std::move(stateJson);
  entry->revision += 1;
  entry->hasState = true;
  return Snapshot{entry->stateJson, entry->revision};
}

std::optional<SharedZustandStore::Snapshot> SharedZustandStore::getState(
    const std::string& storeName,
    const std::string& subtreeKey) {
  auto entry = findEntry(storeName, subtreeKey);
  if (!entry) {
    return std::nullopt;
  }
  std::lock_guard<std::mutex> lock(entry->mutex);
  if (!entry->hasState) {
    return std::nullopt;
  }
  return Snapshot{entry->stateJson, entry->revision};
}

int SharedZustandStore::getRevision(
    const std::string& storeName,
    const std::string& subtreeKey) {
  auto entry = findEntry(storeName, subtreeKey);
  if (!entry) {
    return 0;
  }
  std::lock_guard<std::mutex> lock(entry->mutex);
  return entry->revision;
}

int SharedZustandStore::clear(
    const std::string& storeName,
    const std::string& subtreeKey) {
  auto entry = getOrCreateEntry(storeName, subtreeKey);
  std::lock_guard<std::mutex> lock(entry->mutex);
  entry->stateJson.clear();
  entry->revision += 1;
  entry->hasState = false;
  return entry->revision;
}

} // namespace facebook::react
