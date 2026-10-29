import type { CourseSummary } from "@/lib/courses";

export function CourseList({ courses }: { courses: readonly CourseSummary[] }) {
  return (
    <ul className="mt-6 space-y-2">
      {courses.map((course) => (
        <li key={course.id} className="rounded-lg border bg-card px-4 py-3 text-card-foreground">
          {course.title}
        </li>
      ))}
    </ul>
  );
}
