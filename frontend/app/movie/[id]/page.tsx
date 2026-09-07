import { AppHeader } from "@/components/AppHeader";
import { MovieDetailClient } from "@/components/MovieDetailClient";

export default async function MovieDetailPage({
  params,
}: PageProps<"/movie/[id]">) {
  const { id } = await params;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col bg-white shadow-sm dark:bg-black">
      <AppHeader />
      <MovieDetailClient movieId={id} />
    </div>
  );
}
