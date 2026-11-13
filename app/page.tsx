import Studio from './Studio';
import { APP_VERSION } from '@/lib/app-version';
export const dynamic = 'force-dynamic';
export default function Home(){return <Studio appVersion={APP_VERSION}/>;}
