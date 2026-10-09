import { USER } from "../data/account";

export const ProfilePage = {
  title: () => "Profile",
  body: () => (
    <>
      <section>
        <div class="profile" style={{ padding: 0, border: 0 }}>
          <span class="avatar">{USER.initials}</span>
          <span><b>{USER.name}</b><span>Member since {USER.since}</span></span>
        </div>
      </section>
      <section>
        <div class="row"><span class="muted">Email</span><b>{USER.email}</b></div>
        <div class="row"><span class="muted">Phone</span><b>{USER.phone}</b></div>
        <div class="row"><span class="muted">Insider</span><b>{USER.points}</b></div>
      </section>
      <section>
        <div class="row"><span><b>Home</b><small>14, 5th Cross, Indiranagar, {USER.city} 560038</small></span><span class="status new">Default</span></div>
        <div class="row"><span><b>Work</b><small>Prestige Tech Park, Marathahalli, {USER.city} 560103</small></span></div>
      </section>
    </>
  ),
};
