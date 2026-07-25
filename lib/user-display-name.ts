interface UserNameFields {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string } | null;
}

export function getUserDisplayName(user: UserNameFields): string {
  const firstLast = [user.firstName, user.lastName]
    .filter((part) => Boolean(part?.trim()))
    .join(" ")
    .trim();

  if (firstLast) {
    return firstLast;
  }

  const email = user.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const fullName = user.fullName?.trim() ?? "";

  if (fullName && fullName.toLowerCase() !== email.toLowerCase()) {
    return fullName;
  }

  if (user.firstName?.trim()) {
    return user.firstName.trim();
  }

  if (user.lastName?.trim()) {
    return user.lastName.trim();
  }

  const username = user.username?.trim() ?? "";

  if (username && !username.includes("@")) {
    return username;
  }

  return "User";
}
