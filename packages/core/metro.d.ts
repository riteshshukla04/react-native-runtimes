type ThreadedRuntimeMetroOptions = {
  generatedDir?: string;
  generatedEntry?: string;
  projectRoot?: string;
  roots?: string[];
};

type ThreadedRuntimeComponentRegistration = {
  exportName: string;
  file: string;
  name: string;
};

type ThreadedRuntimeEntryRegistration = {
  file: string;
  runtimeName: string;
};

type RuntimeFunctionRegistration = {
  exportName: string;
  file: string;
  id: string;
};

export function generateThreadedRuntimeEntry(options: {
  generatedEntry: string;
  projectRoot?: string;
  roots?: string[];
}): {
  components: ThreadedRuntimeComponentRegistration[];
  generatedEntry: string;
  runtimeFunctions: RuntimeFunctionRegistration[];
  runtimeEntries: ThreadedRuntimeEntryRegistration[];
};

export function withThreadedRuntime<TConfig extends object>(
  config: TConfig,
  options?: ThreadedRuntimeMetroOptions,
): TConfig & {
  watchFolders?: string[];
};
