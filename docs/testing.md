# Testing

Vitest covers recurrence bounds, weekdays, intervals, month ends, formatting, day parts and validation. React Testing Library is configured for client components. Playwright covers locale redirects and mobile navigation without a production auth bypass. For authenticated journeys, use a dedicated Supabase test project and a real Google test account; never add a bypass to production code.
