import { createContactHandler } from '../../server/contactSubmission';

const handleContact = createContactHandler();
export const POST = ({ request }: { request: Request }) => handleContact(request);
export const ALL = POST;
