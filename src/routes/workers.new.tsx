import { useNavigate } from "react-router-dom";
import { WorkerForm } from "@/components/worker-form";
import { useData } from "@/lib/data-context";
import { toast } from "sonner";

export default function WorkersNew() {
  const { addWorker } = useData();
  const navigate = useNavigate();

  const handleSubmit = (data: any) => {
    addWorker(data);
    toast.success("Worker added successfully.");
    navigate("/workers");
  };

  return <WorkerForm mode="new" onSubmit={handleSubmit} />;
}
