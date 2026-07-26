import {
  workersAdmin as initialWorkers,
  departments as initialDepartments,
  announcementsMock as initialAnnouncements,
  type Worker,
  type Department,
  type Announcement,
} from "@/lib/mock-data";

// In-memory data store for Server Components and Server Actions
// This simulates a real database like PostgreSQL or Supabase
class Database {
  private workers: Worker[] = [...initialWorkers];
  private departments: Department[] = [...initialDepartments];
  private announcements: Announcement[] = [...initialAnnouncements];

  // Helper to simulate network latency
  private async delay(ms: number = 300) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- Workers ---
  async getWorkers() {
    await this.delay();
    return this.workers;
  }

  async getWorkerById(id: string) {
    await this.delay();
    return this.workers.find((w) => w.id === id);
  }

  async addWorker(workerData: Omit<Worker, "id" | "avatar">) {
    await this.delay();
    const newWorker: Worker = {
      ...workerData,
      id: Math.random().toString(36).substring(2, 9),
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        workerData.fullName
      )}`,
    };
    this.workers.push(newWorker);

    // Update department count
    const dept = this.departments.find((d) => d.name === workerData.department);
    if (dept) {
      dept.workersCount += 1;
    }
    return newWorker;
  }

  async updateWorker(id: string, data: Partial<Worker>) {
    await this.delay();
    const index = this.workers.findIndex((w) => w.id === id);
    if (index !== -1) {
      this.workers[index] = { ...this.workers[index], ...data };
      return this.workers[index];
    }
    return null;
  }

  async deleteWorker(id: string) {
    await this.delay();
    const index = this.workers.findIndex((w) => w.id === id);
    if (index !== -1) {
      const worker = this.workers[index];
      this.workers.splice(index, 1);
      
      const dept = this.departments.find((d) => d.name === worker.department);
      if (dept) {
        dept.workersCount = Math.max(0, dept.workersCount - 1);
      }
      return true;
    }
    return false;
  }

  // --- Departments ---
  async getDepartments() {
    await this.delay();
    return this.departments;
  }

  async addDepartment(deptData: Omit<Department, "id" | "workersCount">) {
    await this.delay();
    const newDept: Department = {
      ...deptData,
      id: Math.random().toString(36).substring(2, 9),
      workersCount: 0,
    };
    this.departments.push(newDept);
    return newDept;
  }

  // --- Announcements ---
  async getAnnouncements() {
    await this.delay();
    return this.announcements;
  }

  async addAnnouncement(annData: Omit<Announcement, "id" | "date">) {
    await this.delay();
    const newAnn: Announcement = {
      ...annData,
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString().split("T")[0],
    };
    this.announcements.unshift(newAnn);
    return newAnn;
  }
}

// Singleton instance
export const db = new Database();
