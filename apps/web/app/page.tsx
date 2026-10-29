import type { Metadata } from "next";
import { CourseList } from "@/components/course-list";
import { homeTitle } from "@/lib/copy";
import { stubCourses } from "@/lib/courses";

export const metadata: Metadata = {
  title: homeTitle,
};

// A scaffold placeholder, not an implementation of design/pages/dashboard: #29 builds the dashboard.
export default function HomePage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{homeTitle}</h1>
      <CourseList courses={stubCourses} />
    </main>
  );
}
