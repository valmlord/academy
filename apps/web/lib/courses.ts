import type { Course } from "@academy/lesson-schema";

export type CourseSummary = Pick<Course, "id" | "title">;

// Stub until #30 reads course/; the values are those of course/ai-for-developers/course.yaml.
export const stubCourses: readonly CourseSummary[] = [
  { id: "ai-for-developers", title: "ИИ для разработчиков" },
];
