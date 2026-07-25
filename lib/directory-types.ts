export interface DirectoryUserData {
  externalId: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  phone: string | null;
  managerEmail: string | null;
  isActive: boolean;
}
