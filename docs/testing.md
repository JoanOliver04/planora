# Testing

Vitest covers recurrence bounds, weekdays, intervals, month ends, formatting, day parts, timezone week boundaries, validation, and task-form progressive disclosure. React Testing Library is configured for client components. Playwright covers protected-route redirects, language switching, and mobile login without a production auth bypass. For authenticated journeys, use a dedicated Supabase test project and a real Google test account; never add a bypass to production code.
