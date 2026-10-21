import { useAuth } from "../auth/AuthContext";
import { Link } from "react-router";
import { AccountMethods } from "../components/AccountMethods";
import { PageHeading, Panel } from "../components/ui";
import "./StaffProfilePage.css";

export default function StaffProfilePage() {
  const { session } = useAuth();
  return <div className="staff-profile">
    <PageHeading title="Your profile" description="View your staff information and manage how you sign in." action={<Link className="button button-secondary" to="/staff/security">Change password</Link>} />
    <div className="staff-profile-layout">
      <Panel title="Staff information" className="staff-profile-identity">
        <div className="staff-profile-person">
          <span className="staff-profile-avatar" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0v2" /></svg></span>
          <div><p className="staff-profile-name">{session.identity.full_name}</p><p className="staff-profile-role">{session.isAccountAdmin ? "Account administrator" : "Staff member"}</p></div>
        </div>
        <dl className="staff-profile-details"><div><dt>Staff ID</dt><dd>{session.identity.staff_id}</dd></div></dl>
        <p className="staff-profile-identity-note">Your staff identity is read-only. You can manage your username in account settings.</p>
      </Panel>
      <AccountMethods profileLayout />
    </div>
  </div>;
}
