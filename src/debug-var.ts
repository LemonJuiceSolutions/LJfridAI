
import { db } from './lib/db';

async function main() {
    const varId = 'G9KRpmEznhWgQoVqka1Yt';
    const variable = await db.variable.findUnique({
        where: { id: varId }
    });

    if (!variable) {
        console.log(`Variable ${varId} not found.`);
    } else {
        console.log(`Variable: ${variable.name} (${variable.id})`);
        console.log('Possible Values:', JSON.stringify(variable.possibleValues, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await db.$disconnect();
    });
