cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE ON)

project(native-compose-threaded-zustand)

find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)
find_package(react-native-nitro-modules REQUIRED CONFIG)

add_library(
  native-compose-threaded-zustand
  SHARED
  OnLoad.cpp
  SharedZustandStore.cpp
  SharedZustandStoreJni.cpp
  SharedZustandNitroStore.cpp
)

target_include_directories(
  native-compose-threaded-zustand
  PUBLIC
  .
)

if (REACTNATIVE_MERGED_SO)
  target_link_libraries(
    native-compose-threaded-zustand
    fbjni::fbjni
    ReactAndroid::jsi
    ReactAndroid::reactnative
    react-native-nitro-modules::NitroModules
  )
else()
  target_link_libraries(
    native-compose-threaded-zustand
    fbjni::fbjni
    ReactAndroid::jsi
    react-native-nitro-modules::NitroModules
  )
endif()

target_compile_options(
  native-compose-threaded-zustand
  PRIVATE
  -fexceptions
  -frtti
  -std=c++20
  -Wall
)
