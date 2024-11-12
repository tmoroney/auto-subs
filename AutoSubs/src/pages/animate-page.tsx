import { Drill } from "lucide-react";

export function AnimatePage() {
  return (
    <main className="flex flex-col items-center h-screen bg-gradient-to-b from-blue-50 to-gray-100">
      <div className="text-center mt-[24vh]">
        <Drill className="w-24 h-24 mx-auto mb-4 animate-spin-slow animate-bounce" />
        <h1 className="text-4xl font-extrabold text-gray-800 mb-4 tracking-wide">
          Animation in Progress
        </h1>
        <p className="text-lg text-gray-600 max-w-md mx-auto leading-relaxed">
          The animation crew is crafting something exciting! <br />
          Keep an eye out for dazzling creations soon.
        </p>
      </div>
    </main>
  );
}