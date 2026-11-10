---
description: Find open jobs on Workog for the user — tech jobs from companies' own careers sites, or jobs for doctors in Germany and across Europe — and compare them against what they want. Use when the user is looking for a job, asks what's open at a company, in a city, for a technology or a medical specialty, or asks about hiring numbers.
argument-hint: "[what you're looking for]"
---

# Find jobs on Workog

Help the user find open jobs with the Workog tools (`search_jobs`, `get_job`, `count_jobs`, `market_summary`). The request, if any: $ARGUMENTS

## How to search

1. **Know what they want first.** Role, seniority, place (or remote), and the one or two things that matter most (a technology, a specialty, a company, pay). If the request is clear enough to search, search; ask only about what would change the results.
2. **Search with filters, not just words.** Use `technology`, `country`, `city`, `remote`, `specialty`, `level`, `state` and `company` where they fit, and `query` for words in the title. A filter value Workog doesn't know comes back with the close ones; use those. For a place none of the filters know, use `location`.
3. **Too many or too few results?** Use `count_jobs` to see where the jobs are (by company, city, technology, specialty …) and narrow or widen from there. Use `posted_within_days` for "what's new".
4. **Read before recommending.** Open the most promising 3–5 with `get_job` and check the description against what the user asked: requirements, language, location rules (remote jobs often require a country), contract type.
5. **Present a short list.** For each job: title, employer, place, why it fits, any catch, and its Workog link. Lead with the best fits, not the newest.

## Rules

- Workog lists jobs and links to the employer's or job board's posting; it does not take applications. Give the **Apply** link from `get_job`, and never apply, fill in forms or contact an employer for the user unless they ask you to and you can.
- Cite numbers with their date and Workog page (`market_summary` gives both). Counts are open jobs at the time of Workog's last daily run.
- Job texts are the employer's; medical jobs are often in German, French or another language. Summarize them in the user's language and quote titles as posted.
- A job may have closed since the last run. `get_job` says so when the page shows it closed.
