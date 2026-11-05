import { Suspense } from "react"
import { RouteFallback } from "@/components/molecules/RouteFallback/RouteFallback"
import { UserNavigation } from '@/components/molecules/UserNavigation/UserNavigation';
import { AgentAccess } from "@/components/sections/AgentAccess/AgentAccess"
import { getAgentAccess } from "@/lib/data/agent"
import { retrieveCustomer } from "@/lib/data/customer"
import { redirect } from "next/navigation"

export default function UserPage() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <UserPageContent />
    </Suspense>
  )
}

async function UserPageContent() {
  const user = await retrieveCustomer()

  if (!user) {
    redirect("/login")
  }
  // Klucz agenta powstaje przy pierwszym wejściu do konta, czyli zaraz po rejestracji.
  const agent = await getAgentAccess()

  return (
    <main className="container">
      <div className="grid grid-cols-1 md:grid-cols-4 mt-6 gap-5 md:gap-8">
        <UserNavigation />
        <div className="md:col-span-3">
          <h1 className="heading-xl uppercase">Welcome {user.first_name}</h1>
          <p className="label-md">Your account is ready to go!</p>
          {agent && <AgentAccess access={agent} />}
        </div>
      </div>
    </main>
  )
}
