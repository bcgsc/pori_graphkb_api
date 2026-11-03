jest.mock('orientjs', () => {
    class MockRID {
        constructor(value = { cluster: 1, position: 1 }) {
            if (typeof value === 'string') {
                this.value = value;
                const [cluster, position] = value.replace(/^#/, '').split(':');
                this.cluster = Number(cluster);
                this.position = Number(position);
            } else {
                this.cluster = value.cluster ?? 1;
                this.position = value.position ?? 1;
                this.value = `#${this.cluster}:${this.position}`;
            }
        }

        toString() {
            return this.value;
        }

        valueOf() {
            return this.value;
        }

        [Symbol.toPrimitive]() {
            return this.value;
        }
    }

    return {
        RID: MockRID,
        RecordID: MockRID,
        types: {},
        OrientDBClient: {
            connect: jest.fn(),
        },
    };
});
