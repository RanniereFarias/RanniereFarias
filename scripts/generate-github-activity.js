const fs = require("fs");

const username = process.env.GITHUB_USERNAME;
const token = process.env.GITHUB_TOKEN;

if (!username || !token) {
  throw new Error("Missing GITHUB_USERNAME or GITHUB_TOKEN environment variables.");
}

const query = `
query($login: String!) {
  user(login: $login) {
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
    }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
            weekday
          }
        }
      }
    }
  }
}
`;

async function fetchData() {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { login: username },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}\n${text}`);
  }

  const json = await response.json();

  if (json.errors) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
  }

  return json.data.user;
}

function calculateMetrics(data) {
  const calendar = data.contributionsCollection.contributionCalendar;
  const totalContributions = calendar.totalContributions;
  const activeRepositories = data.repositories.totalCount;
  const days = calendar.weeks.flatMap((week) => week.contributionDays);

  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  let longestStreak = 0;
  let tempStreak = 0;

  for (const day of days) {
    if (day.contributionCount > 0) {
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    } else {
      tempStreak = 0;
    }
  }

  const weekdayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const weekdayTotals = new Array(7).fill(0);

  for (const day of days) {
    weekdayTotals[day.weekday] += day.contributionCount;
  }

  const mostActiveDayIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));
  const mostActiveDay = weekdayNames[mostActiveDayIndex];

  const averagePerWeek = Math.round(totalContributions / 52);

  return {
    totalContributions,
    currentStreak,
    longestStreak,
    activeRepositories,
    mostActiveDay,
    averagePerWeek,
  };
}

function buildActivityBlock(metrics) {
  return [
    "<!-- github-activity:start -->",
    `- Total contributions this year: **${metrics.totalContributions}**`,
    `- Current streak: **${metrics.currentStreak} days**`,
    `- Longest streak: **${metrics.longestStreak} days**`,
    `- Active repositories: **${metrics.activeRepositories}**`,
    `- Most active day of the week: **${metrics.mostActiveDay}**`,
    `- Average contributions per week: **${metrics.averagePerWeek}**`,
    "<!-- github-activity:end -->",
  ].join("\n");
}

function updateReadme(activityBlock) {
  const readmePath = "README.md";
  const readme = fs.readFileSync(readmePath, "utf8");

  const pattern = /<!-- github-activity:start -->([\s\S]*?)<!-- github-activity:end -->/;

  if (!pattern.test(readme)) {
    throw new Error("Could not find github-activity markers in README.md");
  }

  const updated = readme.replace(pattern, activityBlock);
  fs.writeFileSync(readmePath, updated);
}

async function main() {
  const data = await fetchData();
  const metrics = calculateMetrics(data);
  const activityBlock = buildActivityBlock(metrics);
  updateReadme(activityBlock);
  console.log("README.md updated successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});