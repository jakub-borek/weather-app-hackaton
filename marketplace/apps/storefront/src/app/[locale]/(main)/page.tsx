import { redirect } from "next/navigation"

// Hackathon: no homepage (hero, banners, blog). The store opens straight on the
// product listing, the same page as "All Products" in the navbar.
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  redirect(`/${locale}/categories`)
}
