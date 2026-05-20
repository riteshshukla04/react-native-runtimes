// @ts-check

module.exports = {
  runtimeDocs: [
    'intro',
    'installation',
    {
      type: 'category',
      label: 'Threaded Runtime',
      items: [
        'threaded-runtime/render-components',
        'threaded-runtime/pass-props',
        'threaded-runtime/prewarming',
        'threaded-runtime/headless-runtime',
      ],
    },
    {
      type: 'category',
      label: 'Shared State',
      items: ['shared-state/multi-runtime-zustand'],
    },
    'examples',
  ],
};
