const path = require('path');

function runtimeFunctionId(filename, projectRoot, exportName) {
  const root = projectRoot ? path.resolve(projectRoot) : process.cwd();
  const extension = path.extname(filename);
  const withoutExtension = filename.slice(0, -extension.length);
  const relativePath = path
    .relative(root, withoutExtension)
    .split(path.sep)
    .join('/');
  return `${relativePath}.${exportName}`;
}

function runtimeFunctionNameFromCall(node) {
  if (!node || node.type !== 'CallExpression') {
    return undefined;
  }

  const callee = node.callee;
  if (callee.type === 'Identifier' && callee.name === 'runtimeFunction') {
    return null;
  }

  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'runtimeFunction' &&
    callee.property.type === 'Identifier' &&
    (callee.property.name === 'named' || callee.property.name === 'withId')
  ) {
    const nameNode = node.arguments[0];
    return nameNode?.type === 'StringLiteral' ? nameNode.value : null;
  }

  return undefined;
}

function isRuntimeFunctionCall(node) {
  return runtimeFunctionNameFromCall(node) !== undefined;
}

function shouldTransformFile(filename, projectRoot) {
  if (!filename) {
    return false;
  }
  if (filename.includes(`${path.sep}node_modules${path.sep}`)) {
    return false;
  }
  if (!projectRoot) {
    return true;
  }
  const relativePath = path.relative(path.resolve(projectRoot), filename);
  return (
    relativePath &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  );
}

function extractRuntimeCall(node) {
  if (!node) {
    return null;
  }

  if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
    return node;
  }

  return null;
}

function extractCallbackCall(callbackNode) {
  if (
    callbackNode.type !== 'ArrowFunctionExpression' &&
    callbackNode.type !== 'FunctionExpression'
  ) {
    return null;
  }

  if (callbackNode.params.length > 0) {
    return null;
  }

  if (callbackNode.body.type !== 'BlockStatement') {
    return extractRuntimeCall(callbackNode.body);
  }

  if (callbackNode.body.body.length !== 1) {
    return null;
  }

  const statement = callbackNode.body.body[0];
  if (statement.type !== 'ReturnStatement') {
    return null;
  }

  return extractRuntimeCall(statement.argument);
}

function extractCallOnRuntimeCall(node) {
  if (!node || node.type !== 'CallExpression') {
    return null;
  }

  const onCall = node.callee;
  if (onCall.type !== 'CallExpression') {
    return null;
  }

  const onCallee = onCall.callee;
  if (
    onCallee.type !== 'MemberExpression' ||
    onCallee.computed ||
    onCallee.property.type !== 'Identifier' ||
    onCallee.property.name !== 'on'
  ) {
    return null;
  }

  const callExpression = onCallee.object;
  if (
    callExpression.type !== 'CallExpression' ||
    callExpression.callee.type !== 'Identifier' ||
    callExpression.callee.name !== 'call'
  ) {
    return null;
  }

  const scheduledFunction = callExpression.arguments[0];
  const runtimeArg = onCall.arguments[0];
  if (!scheduledFunction || !runtimeArg) {
    return null;
  }

  if (scheduledFunction.type !== 'Identifier') {
    return null;
  }

  return {
    scheduledFunction,
    runtimeArg,
    args: node.arguments,
  };
}

module.exports = function runtimeFunctionBabelPlugin({ types: t }) {
  return {
    name: '@react-native-runtimes/runtime-function',
    visitor: {
      ExportNamedDeclaration(pathRef, state) {
        if (
          !shouldTransformFile(state.file.opts.filename, state.opts.projectRoot)
        ) {
          return;
        }

        const declaration = pathRef.node.declaration;
        if (!declaration || declaration.type !== 'VariableDeclaration') {
          return;
        }

        declaration.declarations.forEach(declarator => {
          if (
            declarator.id.type !== 'Identifier' ||
            !isRuntimeFunctionCall(declarator.init)
          ) {
            return;
          }

          const existingName = runtimeFunctionNameFromCall(declarator.init);
          if (existingName) {
            return;
          }

          const id = runtimeFunctionId(
            state.file.opts.filename,
            state.opts.projectRoot,
            declarator.id.name,
          );

          declarator.init.callee = t.memberExpression(
            t.identifier('runtimeFunction'),
            t.identifier('withId'),
          );
          declarator.init.arguments.unshift(t.stringLiteral(id));
        });
      },

      CallExpression(pathRef, state) {
        if (
          !shouldTransformFile(state.file.opts.filename, state.opts.projectRoot)
        ) {
          return;
        }

        const callOnRuntimeCall = extractCallOnRuntimeCall(pathRef.node);
        if (callOnRuntimeCall) {
          pathRef.replaceWith(
            t.callExpression(
              t.memberExpression(
                callOnRuntimeCall.scheduledFunction,
                t.identifier('runOn'),
              ),
              [callOnRuntimeCall.runtimeArg, ...callOnRuntimeCall.args],
            ),
          );
          return;
        }

        const callee = pathRef.node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'run' ||
          callee.object.type !== 'CallExpression' ||
          callee.object.callee.type !== 'Identifier' ||
          callee.object.callee.name !== 'usingRuntime'
        ) {
          return;
        }

        const runtimeArg = callee.object.arguments[0];
        const callbackArg = pathRef.node.arguments[0];
        const runtimeCall = extractCallbackCall(callbackArg);
        if (!runtimeArg || !runtimeCall) {
          throw pathRef.buildCodeFrameError(
            'usingRuntime(...).run(...) must receive a zero-argument callback that returns one runtime function call.',
          );
        }

        pathRef.replaceWith(
          t.callExpression(
            t.memberExpression(runtimeCall.callee, t.identifier('runOn')),
            [runtimeArg, ...runtimeCall.arguments],
          ),
        );
      },
    },
  };
};
