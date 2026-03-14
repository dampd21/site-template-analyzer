interface StatusMessageProps {
  progress: string;
  errorMsg: string;
}

export default function StatusMessage({ progress, errorMsg }: StatusMessageProps) {
  return (
    <>
      {progress ? (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm text-gray-300">
          {progress}
        </div>
      ) : null}

      {errorMsg ? (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-900/30 p-4 text-sm text-red-300">
          {errorMsg}
        </div>
      ) : null}
    </>
  );
}
