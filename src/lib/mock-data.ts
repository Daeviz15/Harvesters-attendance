export type Worker = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  occupation: string;
  businessName: string;
  avatar: string;
  role: string;
  dob?: string;
  gender?: string;
  maritalStatus?: string;
  homeAddress?: string;
  emergencyContact?: string;
  dateJoined?: string;
  membershipStatus?: string;
  baptismStatus?: string;
  cellGroup?: string;
  businessType?: string;
};

export type Department = {
  id: string;
  name: string;
  admin: string;
  workersCount: number;
};

const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`;

export const workersAdmin: Worker[] = [
  { id: "1", fullName: "Grace Adeyemi", email: "grace@church.org", phone: "+234 801 234 5678", department: "Ushering", occupation: "Accountant", businessName: "GA Consulting", role: "Team Lead", avatar: avatar("Grace Adeyemi") },
  { id: "2", fullName: "Samuel Okoro", email: "samuel@church.org", phone: "+234 802 345 6789", department: "Ushering", occupation: "Software Engineer", businessName: "OkoroTech", role: "Usher", avatar: avatar("Samuel Okoro") },
  { id: "3", fullName: "Mary Johnson", email: "mary@church.org", phone: "+234 803 456 7890", department: "Choir", occupation: "Music Teacher", businessName: "Melody Studio", role: "Choir Director", avatar: avatar("Mary Johnson") },
  { id: "4", fullName: "David Nwosu", email: "david@church.org", phone: "+234 804 567 8901", department: "Choir", occupation: "Sound Engineer", businessName: "Nwosu Audio", role: "Chorister", avatar: avatar("David Nwosu") },
  { id: "5", fullName: "Ruth Bello", email: "ruth@church.org", phone: "+234 805 678 9012", department: "Media", occupation: "Photographer", businessName: "Bello Frames", role: "Media Lead", avatar: avatar("Ruth Bello") },
  { id: "6", fullName: "Peter Danjuma", email: "peter@church.org", phone: "+234 806 789 0123", department: "Media", occupation: "Video Editor", businessName: "Danjuma Studios", role: "Editor", avatar: avatar("Peter Danjuma") },
];

export const workersDeptAdmin: Worker[] = workersAdmin.filter((w) => w.department === "Ushering");

export const departments: Department[] = [
  { id: "d1", name: "Ushering", admin: "Grace Adeyemi", workersCount: 12 },
  { id: "d2", name: "Choir", admin: "Mary Johnson", workersCount: 18 },
  { id: "d3", name: "Media", admin: "Ruth Bello", workersCount: 7 },
  { id: "d4", name: "Protocol", admin: "James Ade", workersCount: 9 },
];

export const sampleWorker = {
  id: "1",
  fullName: "Grace Adeyemi",
  email: "grace@church.org",
  phone: "+234 801 234 5678",
  dob: "1990-04-15",
  gender: "Female",
  maritalStatus: "Married",
  homeAddress: "12 Faith Avenue, Lagos",
  emergencyContact: "John Adeyemi — +234 809 111 2222",
  avatar: avatar("Grace Adeyemi"),
  department: "Ushering",
  role: "Team Lead",
  dateJoined: "2023-01-15",
  membershipStatus: "Active",
  baptismStatus: "baptized",
  cellGroup: "Grace Cell",
  occupation: "Accountant",
  businessName: "GA Consulting",
  businessType: "Financial Services",
};

export type OrgNode = {
  name: string;
  role: string;
  children?: OrgNode[];
};

export const currentWorker = sampleWorker;

export type AttendanceStatus = "present" | "absent" | "excused" | "upcoming";
export type AttendanceEntry = { date: string; status: AttendanceStatus };

const today = new Date();
const year = today.getFullYear();
const month = today.getMonth();
const daysInMonth = new Date(year, month + 1, 0).getDate();
const pattern: AttendanceStatus[] = ["present", "present", "absent", "present", "excused", "present", "present"];

export const attendanceMock: AttendanceEntry[] = Array.from({ length: daysInMonth }, (_, i) => {
  const day = i + 1;
  const date = new Date(year, month, day);
  const iso = date.toISOString().slice(0, 10);
  const isSunday = date.getDay() === 0;
  const isWednesday = date.getDay() === 3;
  if (!isSunday && !isWednesday) return { date: iso, status: "upcoming" as AttendanceStatus };
  if (day > today.getDate()) return { date: iso, status: "upcoming" };
  return { date: iso, status: pattern[day % pattern.length] };
});

export const attendanceStats = (() => {
  const services = attendanceMock.filter((a) => a.status !== "upcoming");
  const present = services.filter((a) => a.status === "present").length;
  const pct = services.length ? Math.round((present / services.length) * 100) : 0;
  let streak = 0;
  for (let i = services.length - 1; i >= 0; i--) {
    if (services[i].status === "present") streak++;
    else break;
  }
  return { percentage: pct, streak, totalServices: services.length, present };
})();

export type Announcement = {
  id: string;
  title: string;
  department: string;
  date: string;
  body: string;
};

export const announcementsMock: Announcement[] = [
  {
    id: "a1",
    title: "Ushering Team Rehearsal Rescheduled",
    department: "Ushering",
    date: "2026-07-18",
    body: "This Saturday's rehearsal moves from 10 AM to 2 PM. Please arrive 15 minutes early for a briefing.",
  },
  {
    id: "a2",
    title: "New Members Welcome Sunday",
    department: "All Departments",
    date: "2026-07-15",
    body: "Every worker is encouraged to personally greet at least two visitors this Sunday.",
  },
  {
    id: "a3",
    title: "Uniform Distribution",
    department: "Ushering",
    date: "2026-07-12",
    body: "New uniforms have arrived. Collect from the department office after second service.",
  },
  {
    id: "a4",
    title: "Quarterly Workers' Meeting",
    department: "All Departments",
    date: "2026-07-05",
    body: "The next general workers' meeting is on the last Saturday of the month at 4 PM.",
  },
  {
    id: "a5",
    title: "Prayer Chain Signup",
    department: "All Departments",
    date: "2026-06-28",
    body: "Sign up for the monthly prayer chain at the reception desk.",
  },
];

export const teammatesMock = workersDeptAdmin;

export const profileCompletenessFields = [
  { key: "fullName", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "dob", label: "Date of Birth" },
  { key: "gender", label: "Gender" },
  { key: "maritalStatus", label: "Marital Status" },
  { key: "homeAddress", label: "Home Address" },
  { key: "emergencyContact", label: "Emergency Contact" },
  { key: "avatar", label: "Profile Photo" },
  { key: "department", label: "Department" },
  { key: "role", label: "Role" },
  { key: "dateJoined", label: "Date Joined" },
  { key: "membershipStatus", label: "Membership Status" },
  { key: "baptismStatus", label: "Baptism Status" },
  { key: "occupation", label: "Occupation" },
  { key: "businessName", label: "Business Name" },
  { key: "businessType", label: "Business Type" },
] as const;

export type UpcomingService = { id: string; title: string; date: string; time: string; role: string };

export const upcomingServices: UpcomingService[] = [
  { id: "s1", title: "Sunday Main Service", date: "2026-07-19", time: "9:00 AM", role: "Door Team Lead" },
  { id: "s2", title: "Midweek Service", date: "2026-07-22", time: "6:00 PM", role: "Usher" },
  { id: "s3", title: "Youth Night", date: "2026-07-25", time: "5:00 PM", role: "Usher" },
];

export const organogram: OrgNode = {
  name: "Pastor E. Okafor",
  role: "Church Admin",
  children: [
    {
      name: "Grace Adeyemi",
      role: "Ushering Admin",
      children: [
        { name: "Samuel Okoro", role: "Usher" },
        { name: "Blessing Eze", role: "Usher" },
      ],
    },
    {
      name: "Mary Johnson",
      role: "Choir Admin",
      children: [
        { name: "David Nwosu", role: "Chorister" },
        { name: "Hannah Musa", role: "Chorister" },
      ],
    },
    {
      name: "Ruth Bello",
      role: "Media Admin",
      children: [
        { name: "Peter Danjuma", role: "Editor" },
        { name: "Isaac Ola", role: "Camera" },
      ],
    },
  ],
};
