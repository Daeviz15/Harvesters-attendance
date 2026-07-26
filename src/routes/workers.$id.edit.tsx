import { useNavigate, useParams } from "react-router-dom";
import { WorkerForm } from "@/components/worker-form";
import { useData } from "@/lib/data-context";
import { toast } from "sonner";

export default function WorkerDetailEdit() {
  const { id } = useParams();
  const { workers, updateWorker } = useData();
  const navigate = useNavigate();
  
  const worker = workers.find(w => w.id === id);

  const handleSubmit = (data: any) => {
    if (id) {
      updateWorker(id, data);
      toast.success("Worker updated successfully.");
      navigate(`/workers/${id}`);
    }
  };

  if (!worker) return <div>Worker not found</div>;

  return <WorkerForm mode="edit" initialData={worker} onSubmit={handleSubmit} />;
}
