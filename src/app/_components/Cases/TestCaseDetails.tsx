import React from "react";

import {
  Divider,
  Grid,
  Group,
  Paper,
  Spoiler,
  Table,
  Text,
  Title,
} from "@mantine/core";

import { TestCase } from "../../../../shared/types";
import { unixTimestampToDateString } from "../../../../shared/utils";
import { ItemDetailsProps } from "../ListDetailView";

const TestCaseDetails: React.FC<ItemDetailsProps<TestCase>> = ({
  item: testCase,
}) => {
  const header = (
    <Group justify="space-between" align="center">
      <Title order={3} lineClamp={2}>
        {testCase.utterance}
      </Title>
      <Group>
        {testCase.dateCreatedUtc && (
          <Text c="dimmed">
            Created: {unixTimestampToDateString(testCase.dateCreatedUtc)}
          </Text>
        )}
        {/* <Tooltip label="Delete test case" withArrow>
          <ActionIcon variant="outline" aria-label="Delete">
            <IconTrash style={{ width: "70%", height: "70%" }} stroke={1.5} />
          </ActionIcon>
        </Tooltip> */}
      </Group>
    </Group>
  );

  const row = (label: string, value: string, isLong: boolean = false) => (
    <Table.Tr>
      <Table.Td fw={600}>{label}</Table.Td>
      <Table.Td>
        {isLong ? (
          <Spoiler maxHeight={75} showLabel="More" hideLabel="Less">
            {value.split("\n").map((line, index) => (
              <Text key={index}>{line}</Text>
            ))}
          </Spoiler>
        ) : (
          value
        )}
      </Table.Td>
    </Table.Tr>
  );

  const body = (
    <Grid>
      <Grid.Col span={12}>
        <Title order={4}>Utterance</Title>
        <Text>{testCase.utterance}</Text>
      </Grid.Col>
      <Grid.Col span={12}>
        <Title order={4}>Good Completions</Title>
        <ul style={{ margin: 0 }}>
          {testCase.goodCompletions.map((completion, index) => (
            <li key={index}>
              <Text>{completion}</Text>
            </li>
          ))}
        </ul>
      </Grid.Col>
      <Grid.Col span={6}>
        <Title order={4}>Bio</Title>
        <Table>
          <Table.Tbody>
            {row("Name", testCase.bio.name)}
            {row("Age", testCase.bio.age.toString())}
            {row("About me", testCase.bio.aboutMe, true)}
          </Table.Tbody>
        </Table>
      </Grid.Col>
      <Grid.Col span={6}>
        <Title order={4}>Context</Title>
        <Table>
          <Table.Tbody>
            {row("Tone", testCase.context.tone)}
            {row("Setting", testCase.context.setting)}
            {row("Conversation Type", testCase.context.conversationType)}
          </Table.Tbody>
        </Table>
      </Grid.Col>
    </Grid>
  );

  return (
    <>
      {header}
      <Divider mt="xs" mb="sm" />
      {body}
    </>
  );
};

export default TestCaseDetails;
