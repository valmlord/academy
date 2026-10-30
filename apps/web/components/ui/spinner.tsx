import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

// design/system/proto.css `.spinner`: 1rem, one turn per 800ms, still under reduced motion (README,
// "Motion and reduced motion"); it always sits next to a word, so stopping it hides nothing.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn(
        "size-4 animate-[spin_800ms_linear_infinite] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
