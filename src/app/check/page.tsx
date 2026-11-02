import { redirect } from 'next/navigation';

/**
 * The bill check is now part of one continuous flow at `/start`. This route is
 * kept as a permanent redirect so existing links (and the marketing site) still
 * land somewhere useful.
 */
export default function CheckRedirect() {
  redirect('/start');
}

