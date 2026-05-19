#pragma once

#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

namespace facebook::react {

class SharedZustandStore {
 public:
  struct Entry {
    mutable std::mutex mutex;
    std::string stateJson;
    int revision = 0;
    bool hasState = false;
  };

  static SharedZustandStore& instance();

  struct Snapshot {
    std::string stateJson;
    int revision = 0;
  };

  Snapshot setState(
      const std::string& storeName,
      const std::string& subtreeKey,
      std::string stateJson);
  Snapshot getOrInitState(
      const std::string& storeName,
      const std::string& subtreeKey,
      std::string initialJson);
  std::optional<Snapshot> getState(
      const std::string& storeName,
      const std::string& subtreeKey);
  int getRevision(const std::string& storeName, const std::string& subtreeKey);
  int clear(const std::string& storeName, const std::string& subtreeKey);

 private:
  static std::string makeKey(
      const std::string& storeName,
      const std::string& subtreeKey);

  std::shared_ptr<Entry> getOrCreateEntry(
      const std::string& storeName,
      const std::string& subtreeKey);
  std::shared_ptr<Entry> findEntry(
      const std::string& storeName,
      const std::string& subtreeKey);

  std::mutex registryMutex_;
  std::unordered_map<std::string, std::shared_ptr<Entry>> stores_;
};

} // namespace facebook::react
