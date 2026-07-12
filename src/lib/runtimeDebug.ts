export const safeStringify = (value: unknown) => {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(
      value,
      (_key, nextValue) => {
        if (typeof nextValue === "object" && nextValue !== null) {
          if (seen.has(nextValue)) return "[Circular]";
          seen.add(nextValue);
        }

        if (nextValue instanceof Error) {
          return {
            name: nextValue.name,
            message: nextValue.message,
            stack: nextValue.stack,
          };
        }

        return nextValue;
      },
      2,
    );
  } catch (stringifyError) {
    return `<<failed to stringify: ${String(stringifyError)}>>`;
  }
};

export const logRuntimeObject = (label: string, value: unknown) => {
  console.log(label, value);
  console.log(`${label} JSON`, safeStringify(value));
};

export const logProfileDebug = (source: string, user: any, profileRes: any) => {
  console.log("========== PROFILE DEBUG ==========");

  console.log(`SOURCE: ${source}`);

  console.log(`USER ID: ${user?.id}`);
  console.log(`USER EMAIL: ${user?.email}`);

  console.log(`PROFILE EXISTS: ${!!profileRes?.data}`);

  console.log(`PROFILE FULL NAME: ${profileRes?.data?.full_name}`);
  console.log(`PROFILE EMAIL: ${profileRes?.data?.email}`);

  console.log(`ERROR EXISTS: ${!!profileRes?.error}`);

  console.log(`ERROR CODE: ${profileRes?.error?.code}`);
  console.log(`ERROR MESSAGE: ${profileRes?.error?.message}`);
  console.log(`ERROR DETAILS: ${profileRes?.error?.details}`);
  console.log(`ERROR HINT: ${profileRes?.error?.hint}`);

  console.log("===================================");
};