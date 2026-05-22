#pragma once

#include <NitroModules/HybridObject.hpp>

#include <optional>
#include <string>

namespace facebook::react {

class SharedZustandNitroStore final : public margelo::nitro::HybridObject {
 public:
  static constexpr auto TAG = "SharedZustandStore";

  SharedZustandNitroStore();

  std::optional<std::string> getState(
      const std::string& storeName,
      const std::string& subtreeKey);
  std::string getOrInitState(
      const std::string& storeName,
      const std::string& subtreeKey,
      const std::string& initialJson,
      const std::string& persistKey);
  int setState(
      const std::string& storeName,
      const std::string& subtreeKey,
      const std::string& stateJson);
  int getRevision(const std::string& storeName, const std::string& subtreeKey);
  int clear(const std::string& storeName, const std::string& subtreeKey);
  void setPersistedState(
      const std::string& persistKey,
      const std::string& stateJson);
  void clearPersistedState(const std::string& persistKey);

 protected:
  void loadHybridMethods() override;
};

void registerSharedZustandNitroStore();

} // namespace facebook::react
