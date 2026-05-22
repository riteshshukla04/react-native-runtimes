#pragma once

#include <jsi/jsi.h>
#include <string>

namespace nativecompose::threadedruntime {

void installRuntimeFunctionJsi(
    facebook::jsi::Runtime &runtime,
    const std::string &runtimeName);

} // namespace nativecompose::threadedruntime
