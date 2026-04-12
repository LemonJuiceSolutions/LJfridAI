'use server';

export async function executeEmailAction(
    connectorId: string,
    to: string,
    subject: string,
    body: string
): Promise<{ success: boolean; message: string }> {
    console.log(`[Email Simulation] Sending email via connector ${connectorId}`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body (truncated): ${body.substring(0, 50)}...`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        success: true,
        message: `Email inviata con successo a ${to}`
    };
}
