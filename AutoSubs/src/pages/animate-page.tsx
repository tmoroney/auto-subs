import { Drill } from "lucide-react";

export function AnimatePage() {
  return (
    <main className="flex flex-col items-center h-screen">
      <div className="text-center mt-[24vh]">
        <Drill className="w-24 h-24 mx-auto mb-4 animate-spin-slow animate-bounce" />
        <h1 className="text-4xl font-extrabold mb-4 tracking-wide">
          Animation in Progress
        </h1>
        <p className="text-lg text-gray-500 max-w-md mx-auto leading-relaxed">
          The animation crew is crafting something exciting! <br />
          Keep an eye out for dazzling creations soon.
        </p>
      </div>
    </main>
  );
}