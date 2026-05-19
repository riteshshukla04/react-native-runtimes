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

export function generateThreadedRuntimeEntry(options: {
  generatedEntry: string;
  projectRoot?: string;
  roots?: string[];
}): {
  components: ThreadedRuntimeComponentRegistration[];
  generatedEntry: string;
};

export function withThreadedRuntime<TConfig extends object>(
  config: TConfig,
  options?: ThreadedRuntimeMetroOptions,
): TConfig & {
  watchFolders?: string[];
};
