cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE ON)

project(native-compose-threaded-runtime)

find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)
find_package(react-native-nitro-modules REQUIRED CONFIG)

add_library(
  native-compose-threaded-runtime
  SHARED
  OnLoad.cpp
  ../../../../cpp/nativecompose/threadedruntime/RuntimeFunctionJsi.cpp
  ../../../../cpp/nativecompose/threadedruntime/RuntimeFunctionScheduler.cpp
  ../../../../cpp/nativecompose/threadedruntime/ThreadedRuntimeNitroFunctions.cpp
)

target_include_directories(
  native-compose-threaded-runtime
  PUBLIC
  .
  ../../../../cpp/nativecompose/threadedruntime
)

if (REACTNATIVE_MERGED_SO)
  target_link_libraries(
    native-compose-threaded-runtime
    fbjni::fbjni
    ReactAndroid::jsi
    ReactAndroid::reactnative
    react-native-nitro-modules::NitroModules
  )
else()
  target_link_libraries(
    native-compose-threaded-runtime
    fbjni::fbjni
    ReactAndroid::jsi
    react-native-nitro-modules::NitroModules
  )
endif()

target_compile_options(
  native-compose-threaded-runtime
  PRIVATE
  -fexceptions
  -frtti
  -std=c++20
  -Wall
)
