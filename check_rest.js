const url = "https://azareokuyvvhikdkuumq.supabase.co/rest/v1/profiles?select=first_name,avatar_url&order=created_at.desc&limit=5";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6YXJlb2t1eXZ2aGlrZGt1dW1xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTUzNjYxOSwiZXhwIjoyMDk3MTEyNjE5fQ.SnJaOXNRyyT-WNIcxB2wTpg6rOe1oLbrorX1QirzjpM";

fetch(url, {
  headers: {
    "apikey": key,
    "Authorization": `Bearer ${key}`
  }
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));
